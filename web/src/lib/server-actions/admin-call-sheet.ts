"use server";

/**
 * admin-call-sheet.ts — B2 admin call-sheet editor server action.
 *
 * Updates the inquiry's day-of fields:
 *   - inquiries.event_date          (top-level column)
 *   - inquiries.event_location      (top-level column — used as city
 *     fallback when venue isn't set)
 *   - inquiries.event_timezone      (top-level column)
 *   - interpreted_query.date.call_time     (JSONB)
 *   - interpreted_query.date.wrap_time     (JSONB)
 *   - interpreted_query.date.duration      (JSONB)
 *   - interpreted_query.location.venue_name      (JSONB)
 *   - interpreted_query.location.google_maps_url (JSONB)
 *   - interpreted_query.brief.special_requirements (JSONB — "notes")
 *
 * Emits a `call_sheet_update` chat message into the group thread so
 * the client + talent see what changed in their conversation.
 */

import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type CallSheetFields = {
  eventDate?: string | null;        // YYYY-MM-DD
  eventLocation?: string | null;    // city / region fallback
  eventTimezone?: string | null;
  callTime?: string | null;         // HH:MM 24h or text
  wrapTime?: string | null;
  duration?: string | null;         // free text "8 hours"
  venueName?: string | null;
  googleMapsUrl?: string | null;
  notes?: string | null;            // logistics notes (mapped to special_requirements)
};

export type UpdateCallSheetResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateCallSheetAsAdmin(
  inquiryId: string,
  fields: CallSheetFields,
): Promise<UpdateCallSheetResult> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: "Not authorised." };
    const { supabase, tenantId, user } = auth;

    const admin = createServiceRoleClient();
    const write = admin ?? supabase;

    const { data: inq, error: readErr } = await write
      .from("inquiries")
      .select("id, interpreted_query, version")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (readErr || !inq) return { ok: false, error: "Inquiry not found." };

    const iq = (inq.interpreted_query ?? {}) as Record<string, unknown>;
    const iqDate = ((iq.date ?? {}) as Record<string, unknown>);
    const iqLocation = ((iq.location ?? {}) as Record<string, unknown>);
    const iqBrief = ((iq.brief ?? {}) as Record<string, unknown>);

    // Selectively overwrite only the keys the caller provided. undefined
    // leaves the existing value; null clears it.
    const set = <T,>(obj: Record<string, unknown>, key: string, val: T | null | undefined) => {
      if (val === undefined) return;
      if (val === null) delete obj[key];
      else obj[key] = val;
    };
    set(iqDate, "call_time", fields.callTime);
    set(iqDate, "wrap_time", fields.wrapTime);
    set(iqDate, "duration", fields.duration);
    set(iqLocation, "venue_name", fields.venueName);
    set(iqLocation, "google_maps_url", fields.googleMapsUrl);
    set(iqBrief, "special_requirements", fields.notes);

    const nextIq = { ...iq, date: iqDate, location: iqLocation, brief: iqBrief };

    const update: Record<string, unknown> = {
      interpreted_query: nextIq,
      version: (inq.version as number) + 1,
    };
    if (fields.eventDate !== undefined) update.event_date = fields.eventDate;
    if (fields.eventLocation !== undefined) update.event_location = fields.eventLocation;
    if (fields.eventTimezone !== undefined) update.event_timezone = fields.eventTimezone;

    const { error: updateErr } = await write
      .from("inquiries")
      .update(update)
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId);
    if (updateErr) return { ok: false, error: updateErr.message };

    // Best-effort notification message into the group thread so client +
    // talent see the call-sheet update without manually checking.
    // Use the call_sheet_update message_kind for structured rendering.
    const changedFields: string[] = [];
    if (fields.eventDate !== undefined) changedFields.push("date");
    if (fields.callTime !== undefined) changedFields.push("call time");
    if (fields.wrapTime !== undefined) changedFields.push("wrap time");
    if (fields.duration !== undefined) changedFields.push("duration");
    if (fields.venueName !== undefined) changedFields.push("venue");
    if (fields.googleMapsUrl !== undefined) changedFields.push("map");
    if (fields.eventLocation !== undefined) changedFields.push("location");
    if (fields.notes !== undefined) changedFields.push("notes");
    if (changedFields.length > 0) {
      const summary = changedFields.length === 1
        ? `Updated ${changedFields[0]}.`
        : `Updated ${changedFields.slice(0, -1).join(", ")} and ${changedFields[changedFields.length - 1]}.`;
      const { error: msgErr } = await write.from("inquiry_messages").insert({
        inquiry_id: inquiryId,
        tenant_id: tenantId,
        thread_type: "group",
        sender_user_id: user.id,
        body: `Call sheet — ${summary}`,
        message_kind: "call_sheet_update",
        card_payload: {
          changed_field: changedFields.join(", "),
          by_name: null, // sender profile resolved at render time
        },
        metadata: {},
      });
      if (msgErr) {
        logServerError("admin-call-sheet.notifyMessage", msgErr);
      }
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin-call-sheet.updateCallSheetAsAdmin", err);
    return { ok: false, error: "Unexpected error." };
  }
}
