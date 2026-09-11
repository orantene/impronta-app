import "server-only";

/**
 * `POSLinkBooking`'s list: the bookings this sale's customer could be paying
 * for, each with what is still owed on it, so the sheet can say "Balance
 * $1,255 due at visit" before the operator links anything.
 *
 * Two kinds today. An `agency_booking` (an appointment or a project) is
 * matched the way the client record matches it (its order, its
 * conversation, or its client account) and owes `total_client_revenue`
 * minus what `booking_transactions` already holds. An `admission` (a
 * ticket) is matched on `customer_id` and owes nothing: linking a sale to
 * it makes the sale's items its extras. A `talent_booking` carries no
 * customer at all (`client_label` is free text), so it is never offered.
 *
 * Read-only; the write is `pos_link_booking`.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./sale-rows";
import type { LinkedBookingKind } from "./link-booking";

export type BookingCandidate = {
  readonly bookingId: string;
  readonly bookingKind: LinkedBookingKind;
  readonly title: string;
  readonly startsAt: string | null;
  /** What the booking still owes; 0 for a ticket. */
  readonly owedCents: number;
  /** Already paid in full (agency bookings only): listed under "Show paid bookings". */
  readonly paid: boolean;
  /** Guests on the ticket, for an admission. */
  readonly partySize: number | null;
};

export type BookingCandidatesResult =
  | { ok: true; customerName: string | null; candidates: BookingCandidate[]; linkedBookingId: string | null }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "no_customer" | "unavailable" };

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function listBookingCandidates(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    /**
     * The customer the counter has attached but not yet written (the row
     * lands on the order at collection, `startCollection` → `ensureCustomer`);
     * used when the order carries none of its own.
     */
    customerId?: string | null;
  },
): Promise<BookingCandidatesResult> {
  const order = await admin.from("orders").select("id, tenant_id, customer_id").eq("id", input.orderId).maybeSingle();
  if (order.error) {
    logServerError("pos.bookingCandidates.order", order.error);
    return { ok: false, reason: "unavailable" };
  }
  const row = order.data as { id: string; tenant_id: string; customer_id: string | null } | null;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };

  const linked = await admin
    .from("order_lines")
    .select("booking_id")
    .eq("order_id", input.orderId)
    .not("booking_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (linked.error) logServerError("pos.bookingCandidates.linked", linked.error);
  const linkedBookingId = (linked.data as { booking_id?: string | null } | null)?.booking_id ?? null;

  const customerId = row.customer_id ?? input.customerId ?? null;
  if (!customerId) return { ok: false, reason: "no_customer" };

  const customer = await admin
    .from("customers")
    .select("id, display_name, email, user_id")
    .eq("id", customerId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (customer.error) {
    logServerError("pos.bookingCandidates.customer", customer.error);
    return { ok: false, reason: "unavailable" };
  }
  const c = customer.data as { id: string; display_name: string | null; email: string | null; user_id: string | null } | null;
  if (!c) return { ok: false, reason: "no_customer" };

  const orders = await admin
    .from("orders")
    .select("id, inquiry_id")
    .eq("tenant_id", input.tenantId)
    .eq("customer_id", c.id)
    .limit(200);
  if (orders.error) {
    logServerError("pos.bookingCandidates.orders", orders.error);
    return { ok: false, reason: "unavailable" };
  }
  const orderRows = (orders.data ?? []) as Array<{ id: string; inquiry_id: string | null }>;
  const orderIds = orderRows.map((o) => o.id);
  const inquiryIds = [...new Set(orderRows.map((o) => o.inquiry_id).filter((x): x is string => typeof x === "string"))];
  const ors = [
    orderIds.length > 0 ? `order_id.in.(${orderIds.join(",")})` : null,
    inquiryIds.length > 0 ? `source_inquiry_id.in.(${inquiryIds.join(",")})` : null,
    c.user_id ? `client_user_id.eq.${c.user_id}` : null,
  ].filter((x): x is string => x !== null);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [bookings, admissions] = await Promise.all([
    ors.length > 0
      ? admin
          .from("agency_bookings")
          .select("id, title, status, starts_at, total_client_revenue")
          .eq("tenant_id", input.tenantId)
          .or(ors.join(","))
          .not("status", "in", "(cancelled,archived)")
          .order("starts_at", { ascending: true })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("admissions")
      .select("id, session_id, starts_at, party_size, status, sessions:session_id(title)")
      .eq("tenant_id", input.tenantId)
      .eq("customer_id", c.id)
      .eq("status", "valid")
      .gte("starts_at", since)
      .order("starts_at", { ascending: true })
      .limit(50),
  ]);
  if (bookings.error) {
    logServerError("pos.bookingCandidates.bookings", bookings.error);
    return { ok: false, reason: "unavailable" };
  }
  if (admissions.error) {
    logServerError("pos.bookingCandidates.admissions", admissions.error);
    return { ok: false, reason: "unavailable" };
  }

  type BookingRow = { id: string; title: string | null; status: string | null; starts_at: string | null; total_client_revenue: number | string | null };
  // A counter sale's own shell (`bookingShellForOrder`, titled "POS sale") is
  // a sale, not a booking a sale could pay for: never offered.
  const bookingRows = ((bookings.data ?? []) as BookingRow[]).filter((b) => b.title !== "POS sale");
  const paidByBooking = new Map<string, number>();
  if (bookingRows.length > 0) {
    const paid = await admin
      .from("booking_transactions")
      .select("booking_id, gross_amount_cents, status")
      .in("booking_id", bookingRows.map((b) => b.id));
    if (paid.error) {
      logServerError("pos.bookingCandidates.paid", paid.error);
      return { ok: false, reason: "unavailable" };
    }
    for (const t of (paid.data ?? []) as Array<{ booking_id: string; gross_amount_cents: number | string; status: string }>) {
      if (t.status !== "paid") continue;
      paidByBooking.set(t.booking_id, (paidByBooking.get(t.booking_id) ?? 0) + num(t.gross_amount_cents));
    }
  }

  const candidates: BookingCandidate[] = bookingRows.map((b) => {
    const owed = Math.round(num(b.total_client_revenue) * 100);
    const paid = paidByBooking.get(b.id) ?? 0;
    const owedCents = Math.max(0, owed - paid);
    return {
      bookingId: b.id,
      bookingKind: "agency_booking",
      title: b.title?.trim() || b.id.slice(0, 8),
      startsAt: b.starts_at,
      owedCents,
      paid: owed > 0 && owedCents === 0,
      partySize: null,
    };
  });
  type AdmissionRow = {
    id: string;
    starts_at: string | null;
    party_size: number | string | null;
    sessions: { title: string | null } | { title: string | null }[] | null;
  };
  for (const a of (admissions.data ?? []) as AdmissionRow[]) {
    const session = Array.isArray(a.sessions) ? a.sessions[0] : a.sessions;
    candidates.push({
      bookingId: a.id,
      bookingKind: "admission",
      title: session?.title?.trim() || a.id.slice(0, 8),
      startsAt: a.starts_at,
      owedCents: 0,
      paid: false,
      partySize: a.party_size == null ? null : num(a.party_size),
    });
  }

  return { ok: true, customerName: c.display_name?.trim() || c.email || null, candidates, linkedBookingId };
}
