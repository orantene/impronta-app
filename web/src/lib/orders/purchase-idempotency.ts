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
 * A REPLAY IS BOUND TO THE BUYER. The first order (and its Checkout session) is
 * handed back only when the caller's contact email matches the first order's
 * buyer: `customers.email` when the order has a customer, else the payment row's
 * `payer_email`; case-insensitive. Anyone else holding the key gets
 * `engine_error` and learns nothing about the first order (money review of
 * #4099). An order with no email on either side matches only a caller with no
 * email, by phone when both have one.
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

export type ReplayBuyer = { email?: string | null; phone?: string | null };

const NOT_YOURS: PurchaseResult = {
  ok: false,
  reason: "engine_error",
  error: "This order could not be placed. Please start again.",
};

const norm = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null);

/** Does the caller look like the first order's buyer? An unreadable buyer refuses. */
async function sameBuyer(
  admin: Pick<SupabaseClient, "from">,
  order: KeyedOrder,
  payerEmail: string | null,
  buyer: ReplayBuyer,
): Promise<boolean | "unavailable"> {
  let email = norm(payerEmail);
  let phone: string | null = null;
  if (order.customer_id) {
    const { data, error } = await admin
      .from("customers")
      .select("id, email, phone_e164")
      .eq("id", order.customer_id)
      .maybeSingle();
    if (error) {
      logServerError("orders.replayKeyedPurchase/customer", error);
      return "unavailable";
    }
    const c = data as { email?: string | null; phone_e164?: string | null } | null;
    email = norm(c?.email) ?? email;
    phone = norm(c?.phone_e164);
  }
  const callerEmail = norm(buyer.email);
  if (email || callerEmail) return email !== null && email === callerEmail;
  const callerPhone = norm(buyer.phone);
  if (phone || callerPhone) return phone !== null && phone === callerPhone;
  return true;
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
  buyer: ReplayBuyer,
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
    .select("id, booking_id, status, gross_amount_cents, created_at, payer_email")
    .eq("order_id", order.id);
  if (txnErr) {
    logServerError("orders.replayKeyedPurchase/txn", txnErr);
    return { ok: false, reason: "engine_error", error: "Could not place the order." };
  }
  type TxnRow = { id: string; booking_id: string | null; status: string; gross_amount_cents: number | null; created_at?: string | null; payer_email?: string | null };
  const allTxns = (txns ?? []) as TxnRow[];
  const txn = allTxns
    .filter((t) => t.status !== "failed" && t.status !== "cancelled")
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0] ?? null;

  // Bound to the buyer BEFORE anything else about the order is read or returned.
  const payerEmail = allTxns.map((t) => t.payer_email ?? null).find((e) => !!e) ?? null;
  const mine = await sameBuyer(admin, order, payerEmail, buyer);
  if (mine === "unavailable") return { ok: false, reason: "engine_error", error: "Could not place the order." };
  if (!mine) {
    logServerError("orders.replayKeyedPurchase/buyer_mismatch", `key reused by a different buyer for order ${order.id}`);
    return NOT_YOURS;
  }

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
