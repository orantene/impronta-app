"use server";

/**
 * Call sheet — server actions. B2 from the inquiry-booking improvement
 * plan.
 *
 * Two writes (save full / clear) + one read.
 * Tenant-scoped via requireStaffTenantAction; the call_sheet_payload
 * column inherits agency_bookings' RLS (staff-of-tenant for writes).
 */

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { emitFieldChange, type FieldVisibility } from "@/lib/inquiry/audit-field-emit";
import type { ServerActionResult } from "@/lib/server-actions/result";
import {
  normalizeCallSheetPayload,
  type CallSheetPayload,
} from "./types";

/** Field-level audit map for call-sheet payload keys (Details v3 §4.3).
 *  Maps each scalar payload key to its activity-feed group + visibility
 *  scope. Array fields (talents/contacts) are intentionally excluded —
 *  diffing nested arrays produces noisy rows; the existing
 *  `call_sheet_changed` audit event + chat card already cover those. */
const CALL_SHEET_FIELD_MAP: Record<
  keyof Omit<CallSheetPayload, "talents" | "contacts">,
  { group: string; visibility: FieldVisibility }
> = {
  general_call_time:  { group: "schedule",  visibility: "client_visible" },
  general_wrap_time:  { group: "schedule",  visibility: "client_visible" },
  hmua_call_time:     { group: "schedule",  visibility: "talent_visible" },
  venue:              { group: "location",  visibility: "client_visible" },
  venue_address:      { group: "location",  visibility: "client_visible" },
  parking_note:       { group: "logistics", visibility: "talent_visible" },
  holding_area:       { group: "logistics", visibility: "talent_visible" },
  transport_note:     { group: "logistics", visibility: "talent_visible" },
  weather_note:       { group: "logistics", visibility: "talent_visible" },
  internal_note:      { group: "internal",  visibility: "admin_only" },
};

/** Load the call sheet payload + a few booking facts (title, dates) so
 *  the editor page can render the header without a second query. Returns
 *  null when the booking doesn't exist or isn't readable by the caller. */
export async function loadBookingCallSheet(
  bookingId: string,
): Promise<{
  bookingId: string;
  bookingTitle: string;
  startsAt: string | null;
  endsAt: string | null;
  payload: CallSheetPayload;
  updatedAt: string | null;
} | null> {
  const session = await getCachedActorSession();
  if (!session.user) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("agency_bookings")
    .select("id, title, starts_at, ends_at, call_sheet_payload, call_sheet_updated_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    logServerError("call-sheet/load", error);
    return null;
  }
  if (!data) return null;

  return {
    bookingId: data.id as string,
    bookingTitle: (data.title as string) ?? "Booking",
    startsAt: (data.starts_at as string | null) ?? null,
    endsAt: (data.ends_at as string | null) ?? null,
    payload: normalizeCallSheetPayload(data.call_sheet_payload),
    updatedAt: (data.call_sheet_updated_at as string | null) ?? null,
  };
}

/** Persist a full call-sheet payload. Replaces the previous payload
 *  wholesale — the editor sends the whole document on save. */
export async function saveBookingCallSheet(
  bookingId: string,
  payload: CallSheetPayload,
): Promise<ServerActionResult> {
  try {
    if (!bookingId) return { ok: false, error: "Missing booking id." };

    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId, tenantSlug } = auth;

    // Verify the booking belongs to the caller's tenant. Also pull the
    // prior call_sheet_payload so we can diff per-field for the Details-
    // tab audit feed (v3 §4.3) after the UPDATE succeeds.
    const { data: booking, error: lookupErr } = await supabase
      .from("agency_bookings")
      .select("id, source_inquiry_id, call_sheet_payload")
      .eq("id", bookingId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (lookupErr) {
      logServerError("call-sheet/save_lookup", lookupErr);
      return { ok: false, error: lookupErr.message };
    }
    if (!booking) return { ok: false, error: "Booking not found in this workspace." };

    // Defensive normalize — strips unknown fields, fills missing keys.
    const normalized = normalizeCallSheetPayload(payload);
    const priorPayload = normalizeCallSheetPayload(booking.call_sheet_payload);

    const { error: updErr } = await supabase
      .from("agency_bookings")
      .update({
        call_sheet_payload: normalized,
        call_sheet_updated_at: new Date().toISOString(),
        call_sheet_updated_by_user_id: user.id,
      })
      .eq("id", bookingId)
      .eq("tenant_id", tenantId);
    if (updErr) {
      logServerError("call-sheet/save_update", updErr);
      return { ok: false, error: updErr.message };
    }

    revalidatePath(`/${tenantSlug}`, "layout");

    // Audit emit — fire-and-forget. Failure must never block the save.
    const auditInquiryId = (booking.source_inquiry_id as string | null) ?? null;
    if (auditInquiryId) {
      await supabase.rpc("inquiry_audit_emit", {
        p_inquiry_id: auditInquiryId,
        p_kind: "call_sheet_changed",
        p_payload: {
          booking_id: bookingId,
          changed_at: new Date().toISOString(),
          changed_by_user_id: user.id,
        },
      }).then((r) => { if (r.error) logServerError("audit.emit.call_sheet_changed", r.error); });

      // v3 §4.3: per-field audit emits so the Details-tab Activity feed
      // shows one row per changed scalar with the correct visibility
      // scope. Keyed on source_inquiry_id (the audit log is inquiry-
      // scoped). Array fields (talents/contacts) skipped — covered by
      // the parent `call_sheet_changed` event above.
      for (const [key, meta] of Object.entries(CALL_SHEET_FIELD_MAP) as Array<
        [keyof typeof CALL_SHEET_FIELD_MAP, { group: string; visibility: FieldVisibility }]
      >) {
        const before = priorPayload[key];
        const after = normalized[key];
        if (before === after) continue;
        await emitFieldChange(supabase, {
          inquiryId: auditInquiryId,
          fieldGroup: meta.group,
          fieldKey: `call_sheet.${key}`,
          oldValue: before,
          newValue: after,
          visibility: meta.visibility,
          actorRole: "admin",
        }).then((r) => { if (!r.ok) logServerError("call-sheet.save.fieldEmit", r.error); });
      }
      // §6 chat-card: emit call_sheet_update card into the group thread.
      try {
        const byName = (user as { display_name?: string }).display_name ?? "";
        await supabase.from("inquiry_messages").insert({
          inquiry_id: auditInquiryId,
          tenant_id: tenantId,
          thread_type: "group",
          sender_user_id: user.id,
          body: "Call sheet updated.",
          message_kind: "call_sheet_update",
          card_payload: { changed_field: "schedule", by_name: byName },
        });
      } catch (emitErr) {
        logServerError("call-sheet.save.chatCard", emitErr);
      }
    }

    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("call-sheet/save_unhandled", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Clear the call sheet (set payload + timestamps back to null). */
export async function clearBookingCallSheet(
  bookingId: string,
): Promise<ServerActionResult> {
  try {
    if (!bookingId) return { ok: false, error: "Missing booking id." };

    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId, tenantSlug } = auth;

    const { error } = await supabase
      .from("agency_bookings")
      .update({
        call_sheet_payload: null,
        call_sheet_updated_at: null,
        call_sheet_updated_by_user_id: null,
      })
      .eq("id", bookingId)
      .eq("tenant_id", tenantId);
    if (error) {
      logServerError("call-sheet/clear", error);
      return { ok: false, error: error.message };
    }

    revalidatePath(`/${tenantSlug}`, "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("call-sheet/clear_unhandled", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// Note: do NOT re-export `EMPTY_CALL_SHEET` here — Next.js forbids
// non-async exports in `"use server"` files (would crash the production
// build with "A 'use server' file can only export async functions").
// Import constants directly from `./types`.
