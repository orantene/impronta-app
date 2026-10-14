import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * TUL-714: a pay-now booking whose checkout failed or lapsed keeps
 * `agency_bookings.status = 'confirmed'` while its ORDER is `cancelled` or
 * `expired` (the unwind and the expire-orders cron both close the order and
 * the hold, neither touches the booking row). Agenda, Clientes and Hoy read
 * the booking status and so showed "Confirmado" for a booking nobody paid.
 *
 * Display rule: a confirmed booking whose order is dead, with nothing paid,
 * is read as cancelled. Never applies once any money is on the booking.
 */
const DEAD_ORDER_STATUSES = new Set(["cancelled", "expired"]);

export function effectiveBookingStatus(input: {
  status: string | null | undefined;
  orderStatus: string | null | undefined;
  paymentStatus: string | null | undefined;
  paidCents: number;
}): string | null | undefined {
  const status = (input.status ?? "").toLowerCase();
  if (status !== "" && status !== "confirmed" && status !== "tentative") return input.status;
  if (!DEAD_ORDER_STATUSES.has((input.orderStatus ?? "").toLowerCase())) return input.status;
  if (input.paidCents > 0) return input.status;
  if ((input.paymentStatus ?? "unpaid").toLowerCase() !== "unpaid") return input.status;
  return "cancelled";
}

/** order id -> status, for the orders a booking page reads. Read-only. */
export async function loadOrderStatuses(
  db: SupabaseClient,
  orderIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (orderIds.length === 0) return out;
  const { data, error } = await db.from("orders").select("id, status").in("id", [...orderIds]);
  if (error) {
    logServerError("talent-agenda.order-statuses", error);
    return out;
  }
  for (const row of (data ?? []) as Array<{ id: string; status: string | null }>) {
    if (row.status) out.set(row.id, row.status);
  }
  return out;
}
