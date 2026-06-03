import type { SupabaseClient } from "@supabase/supabase-js";
import { isMutablePhase } from "./inquiry-lifecycle";
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
 */
export type InquiryDetailsPatch = {
  event_date?: string | null;
  event_location?: string | null;
  message?: string | null;
  quantity?: number | null;
};

const PATCHABLE_FIELDS = ["event_date", "event_location", "message", "quantity"] as const;

/**
 * Version-locked optimistic update of an existing inquiry's editable detail
 * columns (`event_date`, `event_location`, `message`, `quantity`).
 *
 * - Guards: only allowed while the inquiry is in a mutable phase. Booked /
 *   converted (→ booked phase) / archived (closed → archived phase) inquiries
 *   return `{ success: false, error: "locked" }` so the form can surface a
 *   friendly "this inquiry is locked" state instead of a silent no-op.
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
  },
): Promise<EngineResult> {
  return runWithEngineLog("updateInquiryDetails", ctx.inquiryId, ctx.actorUserId, async () => {
    const { data: inq } = await supabase
      .from("inquiries")
      .select("status, is_frozen, version, event_date, event_location, message, quantity")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };

    // Booked / converted / archived (closed) inquiries are locked for edits.
    // `isMutablePhase` already maps the legacy `converted`→booked and
    // `closed`→archived statuses, and treats a frozen inquiry as immutable.
    if (!isMutablePhase(inq.status as string, !!inq.is_frozen)) {
      return { success: false, error: "locked" };
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
      // field clears rather than storing "".
      if (typeof next === "string") {
        const trimmed = next.trim();
        next = field === "quantity" ? next : trimmed.length === 0 ? null : trimmed;
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
  event_date: "event date",
  event_location: "location",
  message: "brief",
  quantity: "quantity",
};
