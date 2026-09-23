import "server-only";

import { logServerError } from "@/lib/server/safe-error";

import type { PaymentState } from "./lifecycle";

/**
 * D-MSG-338: the guest's Payment card could never read "Paid".
 *
 * `readPayment` (lib/messages-v5/client-thread-view.ts) takes the card's state
 * from `card_payload.state` and defaults it to "sent"; nothing in the product
 * ever wrote "paid" onto a `payment_request` card, so a client who had already
 * paid still read "Request sent" in the chat. `ClientPaymentCard` has rendered
 * the paid branch all along - only the writer was missing.
 *
 * This runs at the moment the money already settles: `syncConversationRecord`
 * calls the `messaging_sync_record_state` RPC from every payment path (POS
 * collection, complete-order, purchase, payment links, refunds, ticket mint),
 * and that RPC returns the derived payment state. No new POS writer, no new
 * reader, and no second source of truth: the CHIP stays the record of truth and
 * the card is brought in line with it.
 */

/**
 * The caller is `record-sync`, whose own `Admin` declares only an optional
 * `rpc`. `rpc` is carried here purely so the two types share a property:
 * without it TypeScript's weak-type check rejects an all-optional type that
 * overlaps in nothing (TS2559). `from` is optional for the same reason
 * `record-sync` makes `rpc` optional - a client that cannot read simply does
 * not mirror the card, exactly as the rpc guard does.
 */
type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from?: (table: string) => any;
  rpc?: unknown;
};

/**
 * Settled payment states, mapped to the card state `ClientPaymentCard` draws.
 * A refund keeps the card "paid": the money did arrive, and the refund is its
 * own `change_result` card. Every other state leaves the card alone, so an
 * in-flight request still shows Pay.
 */
const CARD_STATE_FOR: Partial<Record<PaymentState, "paid">> = {
  paid: "paid",
  partially_refunded: "paid",
  refunded: "paid",
};

/** Already settled: never walk a card backwards (a refund must not reopen Pay).
 * "cancelled" is a card state staff set directly, not a payment state; a
 * cancelled card stays cancelled. */
const TERMINAL = new Set(["paid", "cancelled"]);

export type PaymentCardSyncResult =
  | { ok: true; updated: number }
  | { ok: false; reason: "unavailable" };

export async function syncPaymentCardsForRecord(
  admin: Admin,
  input: { tenantId: string; recordId: string; paymentState: PaymentState | null },
): Promise<PaymentCardSyncResult> {
  const target = input.paymentState ? CARD_STATE_FOR[input.paymentState] : undefined;
  if (!target || !input.tenantId || !input.recordId) return { ok: true, updated: 0 };
  if (typeof admin.from !== "function") return { ok: true, updated: 0 };
  const from = admin.from;

  const { data: records, error: recordErr } = await from("conversation_records")
    .select("inquiry_id")
    .eq("tenant_id", input.tenantId)
    .eq("record_id", input.recordId)
    .is("unlinked_at", null);
  if (recordErr) {
    logServerError("messaging.payment-card-sync/records", recordErr);
    return { ok: false, reason: "unavailable" };
  }
  const inquiryIds = [
    ...new Set(((records ?? []) as Array<{ inquiry_id: string | null }>).map((r) => r.inquiry_id).filter((id): id is string => Boolean(id))),
  ];
  if (inquiryIds.length === 0) return { ok: true, updated: 0 };

  const { data: cards, error: cardErr } = await from("inquiry_messages")
    .select("id, card_payload")
    .eq("tenant_id", input.tenantId)
    .eq("message_kind", "payment_request")
    .in("inquiry_id", inquiryIds)
    .is("deleted_at", null);
  if (cardErr) {
    logServerError("messaging.payment-card-sync/cards", cardErr);
    return { ok: false, reason: "unavailable" };
  }

  let updated = 0;
  for (const row of (cards ?? []) as Array<{ id: string; card_payload: Record<string, unknown> | null }>) {
    const payload = row.card_payload && typeof row.card_payload === "object" ? row.card_payload : {};
    const current = typeof payload.state === "string" ? payload.state : "sent";
    if (current === target || TERMINAL.has(current)) continue;
    const { error: updateErr } = await from("inquiry_messages")
      .update({ card_payload: { ...payload, state: target, settledAt: new Date().toISOString() } })
      .eq("id", row.id);
    if (updateErr) {
      logServerError("messaging.payment-card-sync/update", updateErr);
      return { ok: false, reason: "unavailable" };
    }
    updated += 1;
  }
  return { ok: true, updated };
}
