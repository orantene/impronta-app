import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkflowPhase, isMutablePhase } from "./inquiry-lifecycle";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { assertConsistencyAfterWrite, inquiryWriteClient, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";

// SaaS P1.B STEP A: tenant-scoped by construction on every inquiry read and
// write below — cross-tenant ids surface as `forbidden` at the engine boundary.

/**
 * Free-text / scalar fields of an existing inquiry that a coordinator or the
 * client may revise mid-flight (before the inquiry is booked/converted/archived).
 * All optional: a caller patches only the fields the form touched. `undefined`
 * means "leave as-is"; an explicit `null` clears the column.
 *
 * Covers the full "Edit job" field set: the original inquiry request fields
 * plus everything that fills in the Details (contact, brief, schedule,
 * location, logistics notes). `contact_name` / `contact_email` are NOT NULL
 * at the DB level, so a blank value for those is rejected rather than nulled.
 */
export type InquiryDetailsPatch = {
  // Client & contact
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  company?: string | null;
  // Job brief
  event_type_id?: string | null;
  quantity?: number | null;
  message?: string | null;
  // Schedule
  event_date?: string | null;
  event_timezone?: string | null;
  deadline_at?: string | null;
  // Location
  event_location?: string | null;
  // Logistics
  wardrobe_notes?: string | null;
  equipment_notes?: string | null;
  transport_notes?: string | null;
  lodging_notes?: string | null;
  meals_notes?: string | null;
  access_notes?: string | null;
};

const PATCHABLE_FIELDS = [
  "contact_name",
  "contact_email",
  "contact_phone",
  "company",
  "event_type_id",
  "quantity",
  "message",
  "event_date",
  "event_timezone",
  "deadline_at",
  "event_location",
  "wardrobe_notes",
  "equipment_notes",
  "transport_notes",
  "lodging_notes",
  "meals_notes",
  "access_notes",
] as const;

// Text columns the DB declares NOT NULL — clearing them would violate the
// constraint, so a blank value for these is treated as a validation error
// instead of nulling the column.
const REQUIRED_TEXT_FIELDS = new Set<string>(["contact_name", "contact_email"]);

/**
 * Version-locked optimistic update of an existing inquiry's editable detail
 * columns — the full "Edit job" field set (contact, brief, schedule, location,
 * logistics notes). See {@link InquiryDetailsPatch}.
 *
 * - Guards: by default only allowed while the inquiry is in a mutable phase.
 *   Booked / converted (→ booked phase) / archived (closed → archived phase)
 *   inquiries return `{ success: false, error: "locked" }`. Pass
 *   `allowWhenBooked: true` to permit a post-booking clean-up edit (staff
 *   surface only): frozen inquiries stay locked, but a booked inquiry's
 *   request fields can still be tidied. The archived phase stays locked
 *   regardless.
 * - `event_type_id`, when supplied non-null, is validated against
 *   `taxonomy_terms` (kind = 'event_type'); an unknown id returns
 *   `{ success: false, error: "invalid_event_type" }`.
 * - `contact_name` / `contact_email` are NOT NULL: a blank value for either
 *   returns `{ success: false, error: "contact_required" }`.
 * - Optimistic concurrency: the write is gated on `version = expectedVersion`;
 *   a mismatch returns `{ success: false, conflict: true, reason: "version_conflict" }`.
 *   On success the version is bumped and `last_edited_by/at` stamped.
 * - Side-effect: emits a standard engine event whose private-thread system
 *   message captures exactly the fields that changed (so coordinators see what
 *   was revised, and the notification engine / audit log get a structured
 *   payload). The event dispatch is best-effort (the listener chain swallows
 *   its own failures into `failed_engine_effects`); a successful column write is
 *   never rolled back because a side-effect failed.
 *
 * Never throws uncaught — wrapped in `runWithEngineLog`, which converts any
 * thrown error into `{ success: false, error }`.
 */
export async function updateInquiryDetails(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    expectedVersion: number;
    patch: InquiryDetailsPatch;
    /** Staff-only post-booking clean-up: allow editing the inquiry request
     *  fields even once the inquiry has converted to a booking. Frozen and
     *  archived inquiries stay locked. */
    allowWhenBooked?: boolean;
  },
): Promise<EngineResult> {
  return runWithEngineLog("updateInquiryDetails", ctx.inquiryId, ctx.actorUserId, async () => {
    const { data: inq } = await supabase
      .from("inquiries")
      .select(
        "status, is_frozen, version, contact_name, contact_email, contact_phone, company, event_type_id, quantity, message, event_date, event_timezone, deadline_at, event_location, wardrobe_notes, equipment_notes, transport_notes, lodging_notes, meals_notes, access_notes",
      )
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };

    // Booked / converted / archived (closed) inquiries are locked for edits.
    // `isMutablePhase` already maps the legacy `converted`→booked and
    // `closed`→archived statuses, and treats a frozen inquiry as immutable.
    // The post-booking clean-up surface (allowWhenBooked) relaxes the booked
    // lock for staff — but never the frozen or archived lock.
    if (!isMutablePhase(inq.status as string, !!inq.is_frozen)) {
      const phase = getWorkflowPhase(inq.status as string);
      const bookedCleanupOk = ctx.allowWhenBooked && phase === "booked" && !inq.is_frozen;
      if (!bookedCleanupOk) return { success: false, error: "locked" };
    }

    // Validate event_type_id (FK to taxonomy_terms) when changed to a non-null
    // value. The taxonomy is global (no tenant column) — gate on kind only.
    if ("event_type_id" in ctx.patch && ctx.patch.event_type_id) {
      const { data: term } = await supabase
        .from("taxonomy_terms")
        .select("id")
        .eq("id", ctx.patch.event_type_id)
        .eq("kind", "event_type")
        .maybeSingle();
      if (!term) return { success: false, error: "invalid_event_type" };
    }

    // Build the column patch + the changed-field set in one pass. Only fields
    // the caller actually supplied (key present) AND whose value differs from
    // the current row are written, so a no-op save doesn't churn the version or
    // emit a misleading "details updated" event.
    const update: Record<string, unknown> = {};
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (!(field in ctx.patch)) continue;
      let next = (ctx.patch as Record<string, unknown>)[field];
      // Normalize blank strings to null for the text columns so an emptied
      // field clears rather than storing "". `quantity` is numeric and passes
      // through; the action layer coerces/validates it before calling us.
      if (typeof next === "string") {
        const trimmed = next.trim();
        if (field === "quantity") {
          next = trimmed;
        } else if (trimmed.length === 0) {
          // NOT NULL columns cannot be cleared — reject rather than violate
          // the constraint.
          if (REQUIRED_TEXT_FIELDS.has(field)) {
            return { success: false, error: "contact_required" };
          }
          next = null;
        } else {
          next = trimmed;
        }
      }
      const current = (inq as Record<string, unknown>)[field] ?? null;
      const normalizedNext = next ?? null;
      if (normalizedNext === current) continue;
      update[field] = normalizedNext;
      changed[field] = { from: current, to: normalizedNext };
    }

    const changedFields = Object.keys(changed);
    if (changedFields.length === 0) {
      // Nothing to do — report success without bumping the version.
      return { success: true, already: true };
    }

    const writeDetails = await inquiryWriteClient(supabase);
    const { data: updated, error } = await writeDetails
      .from("inquiries")
      .update({
        ...update,
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) {
      return { success: false, conflict: true, reason: "version_conflict" };
    }

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    const summary = changedFields.map((f) => DETAIL_FIELD_LABELS[f] ?? f).join(", ");
    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_DETAILS_UPDATED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { changed },
      systemMessage: {
        threadType: "private",
        eventType: "inquiry_details_updated",
        body: `Inquiry details updated: ${summary}.`,
      },
    });

    return { success: true };
  });
}

const DETAIL_FIELD_LABELS: Record<string, string> = {
  contact_name: "contact name",
  contact_email: "contact email",
  contact_phone: "contact phone",
  company: "company",
  event_type_id: "event type",
  quantity: "talent needed",
  message: "brief",
  event_date: "event date",
  event_timezone: "time zone",
  deadline_at: "confirmation deadline",
  event_location: "location",
  wardrobe_notes: "wardrobe notes",
  equipment_notes: "equipment notes",
  transport_notes: "transport notes",
  lodging_notes: "lodging notes",
  meals_notes: "meals notes",
  access_notes: "access notes",
};
