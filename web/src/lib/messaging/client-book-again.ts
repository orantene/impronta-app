import "server-only";

import { fail } from "./refusals";
import type { ActionResult, MessagingRefusal } from "./types";
import { isBookAgainFulfilment } from "@/lib/messages-v5/guest-book-again";
import { addLine, createDraftOrder } from "@/lib/pos/draft";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type LineRow = {
  offering_id: string | null;
  units: number | null;
  confirmed_at: string | null;
  variant_id: string | null;
  addon_ids: string[] | null;
  session_id: string | null;
  booking_id: string | null;
  order_id: string | null;
};

export type BookAgainCreateInquiry = (
  admin: unknown,
  intent: {
    source: "book_again";
    source_context: { rebook_of_inquiry_id: string; original_booking_id: string };
    requester: { name: string; email?: string; phone?: string; user_id?: string | null };
    location: { city?: string; status: "confirmed" | "unconfirmed" | "online" | "not_sure" };
    date: { event_date?: string; status: "exact" | "flexible" | "not_sure" | "multi_day" | "recurring" };
    brief: { summary: string };
  },
  ctx: {
    tenant_id: string;
    actor_user_id: string | null;
    guest_session_id?: string | null;
    client_user_id?: string | null;
  },
) => Promise<{ ok: true; inquiryId: string } | { ok: false; reason: string }>;

function rows<T>(data: T | T[] | null | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

async function confirmedLinesForRecord(
  admin: Admin,
  input: { tenantId: string; inquiryId: string; recordId: string },
): Promise<ActionResult<{ lines: LineRow[]; originalBookingId: string }>> {
  const { data, error } = await admin
    .from("conversation_records")
    .select("record_kind, record_id, fulfilment_state, inquiry_id, unlinked_at")
    .eq("inquiry_id", input.inquiryId)
    .eq("record_id", input.recordId);
  if (error) return fail("unavailable");
  const live = rows(
    data as {
      record_kind: string;
      record_id: string;
      fulfilment_state: string | null;
      inquiry_id: string;
      unlinked_at: string | null;
    } | null,
  ).filter((r) => !r.unlinked_at);
  if (live.length === 0) return fail("not_found");
  const rec = live[0]!;
  if (rec.inquiry_id !== input.inquiryId) return fail("not_found");
  if (!isBookAgainFulfilment(rec.fulfilment_state)) return fail("not_allowed");

  const { data: byOrder, error: lineErr } = await admin
    .from("order_lines")
    .select("offering_id, units, confirmed_at, variant_id, addon_ids, session_id, booking_id, order_id")
    .eq("order_id", input.recordId);
  if (lineErr) return fail("unavailable");
  let matched = rows(byOrder as LineRow | null);
  if (matched.length === 0) {
    const { data: byBooking, error: bookingErr } = await admin
      .from("order_lines")
      .select("offering_id, units, confirmed_at, variant_id, addon_ids, session_id, booking_id, order_id")
      .eq("booking_id", input.recordId);
    if (bookingErr) return fail("unavailable");
    matched = rows(byBooking as LineRow | null);
  }
  // The record's fulfilment state is the gate (checked above). A sale paid at
  // the counter is confirmed as a whole and never stamps `confirmed_at` on its
  // lines, so when no line carries one every priced line counts (D-MSG-226).
  const stamped = matched.filter((l) => l.confirmed_at && l.offering_id);
  const confirmed = stamped.length > 0 ? stamped : matched.filter((l) => l.offering_id);
  if (confirmed.length === 0) return fail("not_allowed");
  return { ok: true, lines: confirmed, originalBookingId: rec.record_id };
}

/**
 * P6 / owner decision 13: duplicate confirmed lines from a named record into a
 * NEW inquiry + POS draft. Old orders/bookings/payments are never touched.
 * Inquiry create is injected so this file does not grow a second create path
 * and does not import the staff shell.
 */
export async function bookAgainFromRecord(
  admin: Admin,
  input: {
    tenantId: string;
    inquiryId: string;
    recordId: string;
    createInquiry: BookAgainCreateInquiry;
    /** Workspace owner lookup for an unassigned thread (the draft's actor). */
    resolveOwner?: (admin: Admin, tenantId: string) => Promise<string | null>;
  },
): Promise<ActionResult<{ inquiryId: string }>> {
  const { data: inquiry, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, contact_name, contact_email, contact_phone, client_user_id, guest_session_id, owner_user_id, event_date, event_location")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (error) return fail("unavailable");
  if (!inquiry) return fail("not_found");
  const row = inquiry as {
    tenant_id: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    client_user_id: string | null;
    guest_session_id: string | null;
    owner_user_id: string | null;
    event_date: string | null;
    event_location: string | null;
  };
  if (row.tenant_id !== input.tenantId) return fail("wrong_tenant");
  const name = row.contact_name?.trim() ?? "";
  if (!name || (!row.contact_email?.trim() && !row.contact_phone?.trim())) return fail("not_allowed");
  // Unassigned thread: the workspace owner opens the draft (D-MSG-226).
  const draftActor = row.owner_user_id ?? (await input.resolveOwner?.(admin, input.tenantId) ?? null);
  if (!draftActor) return fail("no_owner");

  const packed = await confirmedLinesForRecord(admin, input);
  if (!packed.ok) return packed;

  const created = await input.createInquiry(
    admin,
    {
      source: "book_again",
      source_context: { rebook_of_inquiry_id: input.inquiryId, original_booking_id: packed.originalBookingId },
      requester: {
        name,
        email: row.contact_email?.trim() || undefined,
        phone: row.contact_phone?.trim() || undefined,
        user_id: row.client_user_id,
      },
      location: row.event_location?.trim() ? { city: row.event_location.trim(), status: "unconfirmed" } : { status: "not_sure" },
      date: row.event_date?.trim() ? { event_date: row.event_date.trim().slice(0, 10), status: "exact" } : { status: "not_sure" },
      brief: { summary: "Book again" },
    },
    {
      tenant_id: input.tenantId,
      actor_user_id: row.client_user_id,
      guest_session_id: row.guest_session_id,
      client_user_id: row.client_user_id,
    },
  );
  if (!created.ok) {
    const reason = created.reason;
    const mapped: MessagingRefusal =
      reason === "rate_limited" ? "rate_limited" : reason === "forbidden" ? "not_allowed" : reason === "validation_failed" ? "invalid" : "unavailable";
    return fail(mapped);
  }

  const draft = await createDraftOrder(admin, {
    tenantId: input.tenantId,
    actorUserId: draftActor,
    currency: "USD",
    sourceChannel: "messages",
    context: "messages",
  });
  if (!draft.ok) return { ok: true, inquiryId: created.inquiryId };
  await admin.from("orders").update({ inquiry_id: created.inquiryId, source_channel: "messages" }).eq("id", draft.orderId);

  for (const line of packed.lines) {
    await addLine(admin, {
      tenantId: input.tenantId,
      orderId: draft.orderId,
      line: {
        offeringId: line.offering_id as string,
        units: Math.max(1, Number(line.units) || 1),
        variantId: line.variant_id,
        addonIds: line.addon_ids ?? undefined,
        sessionId: line.session_id,
      },
      proposedBy: "client",
    });
  }
  return { ok: true, inquiryId: created.inquiryId };
}
