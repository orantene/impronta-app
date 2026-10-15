import { logServerError } from "@/lib/server/safe-error";
import type { RecordChip } from "@/lib/messaging/types";

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
/** Any client with `.from()`: the service client or the messaging readers' loose Admin. */
export type OrderReadDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

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
  db: OrderReadDb,
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

const MONEY_IN_STATES = new Set(["paid", "partially_refunded", "deposit_paid", "refunded", "partial"]);

/**
 * TUL-715: the inbox record chip and the thread header read
 * `conversation_records.payment_state`, which stays "opened" when the order
 * is cancelled or lapses. Settle an ORDER chip from the live order status so
 * the inbox says what Clientes, Hoy and the agenda say. Never touches a chip
 * that carries money, and never other record kinds.
 */
export function settleRecordChips(
  chips: readonly RecordChip[],
  orderStatusById: ReadonlyMap<string, string>,
): RecordChip[] {
  return chips.map((chip) => {
    if (chip.kind !== "order") return chip;
    if (MONEY_IN_STATES.has((chip.paymentState ?? "").toLowerCase())) return chip;
    const order = (orderStatusById.get(chip.recordId) ?? "").toLowerCase();
    if (!DEAD_ORDER_STATUSES.has(order)) return chip;
    return { ...chip, paymentState: order === "expired" ? "expired" : "failed" };
  });
}

/** Read the live status of every order chip, then settle them. Read-only. */
export async function settleChipsFromOrders(db: OrderReadDb, chips: readonly RecordChip[]): Promise<RecordChip[]> {
  const ids = chips.filter((c) => c.kind === "order").map((c) => c.recordId);
  if (ids.length === 0) return [...chips];
  return settleRecordChips(chips, await loadOrderStatuses(db, ids));
}
