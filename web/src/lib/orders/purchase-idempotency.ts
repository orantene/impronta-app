import "server-only";

/**
 * `clientOrderKey` made real (TUL-1268 M7, D5).
 *
 * `PurchaseInput.clientOrderKey` was documented as "the idempotency anchor" and
 * nothing stored or checked it, so a double-tapped Pay reached the pipeline
 * twice and minted two orders, two payment rows and two Checkout sessions.
 * Paths behind `lib/commands/run.ts` (cart, appointment, class, package) were
 * covered by the command claim; menu, instant book, tickets, session seats and
 * reservations were not.
 *
 * THE MECHANISM, two layers:
 *   1. The key is written to `orders.client_order_key`, and the held migration
 *      `orders_tenant_client_order_key_uniq` makes a second LIVE order with the
 *      same (tenant, key) impossible. A cancelled order (a refused attempt the
 *      pipeline unwound) leaves the index, so the same key can try again.
 *   2. Before any write, the pipeline looks the key up. A finished first order
 *      is REPLAYED: the caller gets the same order, the same transaction id
 *      (so `createCheckoutSessionForTransaction` reuses `cs_txn_<id>` and Stripe
 *      returns the same session) and nothing new is written. A first order still
 *      in flight (draft) is waited on briefly, then replayed. If the two calls
 *      pass the lookup together, the loser's INSERT hits the unique index
 *      (23505) and replays the winner.
 *
 * BEFORE THE HELD MIGRATION IS APPLIED the column does not exist. The lookup
 * gets 42703 / PGRST204, reports `keyColumn: false`, and the pipeline inserts
 * the order without the column: exactly today's behaviour, no new failure mode.
 * Once the migration is applied the same deploy starts enforcing, no code change.
 *
 * Replay is NOT a fingerprint check: the key is per intent (the client makes a
 * new one for a new basket), so a reuse with different lines returns the first
 * order, the way a replayed command does.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { PurchaseResult } from "@/lib/orders/purchase-types";

/** Every status but `cancelled`: the predicate of the held partial unique index. */
export const KEYED_ORDER_STATUSES = [
  "draft",
  "quoted",
  "pending_payment",
  "paid",
  "fulfilled",
  "refunded",
  "partially_refunded",
] as const;

/** Transaction statuses a caller may still open (or reopen) Checkout for. */
const CHARGEABLE_TXN = new Set(["draft", "payment_requested", "pending"]);

/** How long a second call waits for an in-flight first call before giving up. */
const IN_FLIGHT_POLLS = 8;
const IN_FLIGHT_POLL_MS = 250;

type KeyedOrder = {
  id: string;
  status: string;
  customer_id: string | null;
  subtotal_cents: number | null;
  currency: string | null;
  inquiry_id: string | null;
};

type DbError = { code?: string; message?: string } | null;

function isMissingKeyColumn(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /client_order_key/.test(error.message ?? "") && /does not exist|could not find/i.test(error.message ?? "");
}

export function isClientKeyConflict(error: DbError): boolean {
  return !!error && error.code === "23505" && /client_order_key/.test(error.message ?? "");
}

export type KeyLookup =
  | { ok: true; keyColumn: boolean; order: KeyedOrder | null }
  | { ok: false };

export async function findKeyedOrder(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
  key: string,
): Promise<KeyLookup> {
  const { data, error } = await admin
    .from("orders")
    .select("id, status, customer_id, subtotal_cents, currency, inquiry_id")
    .eq("tenant_id", tenantId)
    .eq("client_order_key", key)
    .in("status", [...KEYED_ORDER_STATUSES])
    .maybeSingle();
  if (error) {
    if (isMissingKeyColumn(error)) return { ok: true, keyColumn: false, order: null };
    logServerError("orders.findKeyedOrder", error);
    return { ok: false };
  }
  return { ok: true, keyColumn: true, order: (data as KeyedOrder | null) ?? null };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The first order for this key, as the caller would have received it.
 * `null` means there is nothing to replay (no live order, or the column is
 * missing) and the purchase should proceed.
 */
export async function replayKeyedPurchase(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
  key: string,
  found?: KeyedOrder | null,
): Promise<PurchaseResult | null> {
  let order = found ?? null;
  if (!order) {
    const look = await findKeyedOrder(admin, tenantId, key);
    if (!look.ok) return { ok: false, reason: "engine_error", error: "Could not place the order." };
    order = look.order;
  }
  if (!order) return null;

  // The first call is still writing. Wait for it rather than answering with a
  // half-built order or minting a second one.
  for (let i = 0; i < IN_FLIGHT_POLLS && order.status === "draft"; i += 1) {
    await sleep(IN_FLIGHT_POLL_MS);
    const look = await findKeyedOrder(admin, tenantId, key);
    if (!look.ok) return { ok: false, reason: "engine_error", error: "Could not place the order." };
    if (!look.order) return null; // the first attempt was refused and unwound: run this one
    order = look.order;
  }
  if (order.status === "draft") {
    return { ok: false, reason: "engine_error", error: "This order is already being placed. Please wait a moment." };
  }

  const { data: txns, error: txnErr } = await admin
    .from("booking_transactions")
    .select("id, booking_id, status, gross_amount_cents, created_at")
    .eq("order_id", order.id);
  if (txnErr) {
    logServerError("orders.replayKeyedPurchase/txn", txnErr);
    return { ok: false, reason: "engine_error", error: "Could not place the order." };
  }
  const txn = ((txns ?? []) as Array<{ id: string; booking_id: string | null; status: string; gross_amount_cents: number | null; created_at?: string | null }>)
    .filter((t) => t.status !== "failed" && t.status !== "cancelled")
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0] ?? null;

  let bookingId = txn?.booking_id ?? null;
  if (!bookingId) {
    const { data: booking, error: bookingErr } = await admin
      .from("agency_bookings")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();
    if (bookingErr) logServerError("orders.replayKeyedPurchase/booking", bookingErr);
    bookingId = (booking as { id?: string } | null)?.id ?? null;
  }

  const { data: lineRows, error: linesErr } = await admin.from("order_lines").select("id").eq("order_id", order.id);
  if (linesErr) logServerError("orders.replayKeyedPurchase/lines", linesErr);
  const lineIds = ((lineRows ?? []) as Array<{ id: string }>).map((l) => l.id);
  let allocationIds: string[] = [];
  if (lineIds.length > 0) {
    const { data: allocs, error: allocErr } = await admin
      .from("capacity_allocations")
      .select("id")
      .in("order_line_id", lineIds)
      .is("released_at", null);
    if (allocErr) logServerError("orders.replayKeyedPurchase/allocations", allocErr);
    allocationIds = ((allocs ?? []) as Array<{ id: string }>).map((a) => a.id);
  }

  const collectCents = Math.max(0, Number(txn?.gross_amount_cents ?? 0) || 0);
  return {
    ok: true,
    orderId: order.id,
    inquiryId: order.inquiry_id ?? null,
    customerId: order.customer_id ?? null,
    totalCents: Number(order.subtotal_cents ?? 0) || 0,
    collectCents,
    currency: order.currency ?? "USD",
    payInPerson: order.status === "pending_payment" && !txn,
    allocationIds,
    // Only a payment still open is handed back. A settled one returns null so
    // the caller opens no Checkout at all for an order that is already paid.
    transactionId: txn && CHARGEABLE_TXN.has(txn.status) ? txn.id : null,
    bookingId,
    reservationHoldId: null,
  };
}
