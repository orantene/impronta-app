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
import type { ServerActionResult } from "@/lib/server-actions/result";
import {
  normalizeCallSheetPayload,
  type CallSheetPayload,
} from "./types";

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

    // Verify the booking belongs to the caller's tenant.
    const { data: booking, error: lookupErr } = await supabase
      .from("agency_bookings")
      .select("id, source_inquiry_id")
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
