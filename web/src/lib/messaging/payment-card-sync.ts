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

export type PaidMoney = {
  totalCents: number;
  paidCents: number;
  currency: string;
  method: string;
};

/** One payload the guest Paid line can read. Due is never negative. */
export function paidMoneyFields(input: PaidMoney): {
  totalCents: number;
  paidCents: number;
  dueCents: number;
  currency: string;
  method: string;
} {
  return {
    totalCents: input.totalCents,
    paidCents: input.paidCents,
    dueCents: Math.max(0, input.totalCents - input.paidCents),
    currency: input.currency,
    method: input.method,
  };
}

export async function syncPaymentCardsForRecord(
  admin: Admin,
  input: { tenantId: string; recordId: string; paymentState: PaymentState | null; method?: string | null },
): Promise<PaymentCardSyncResult> {
  const target = input.paymentState ? CARD_STATE_FOR[input.paymentState] : undefined;
  if (!target || !input.tenantId || !input.recordId) return { ok: true, updated: 0 };
  if (typeof admin.from !== "function") return { ok: true, updated: 0 };
  // Call it AS A METHOD. `const from = admin.from` detaches it, and
  // `SupabaseClient.from` uses `this` internally, so the detached call threw;
  // `syncConversationRecord`'s outer catch swallowed it and the card silently
  // never moved while the chip did (D-MSG-342).
  const from = (table: string) => admin.from!(table);

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

  const orderTotal = target === "paid" ? await loadSaleTotal(from, input.recordId) : null;

  let updated = 0;
  for (const row of (cards ?? []) as Array<{ id: string; card_payload: Record<string, unknown> | null }>) {
    const payload = row.card_payload && typeof row.card_payload === "object" ? row.card_payload : {};
    const current = typeof payload.state === "string" ? payload.state : "sent";
    const needsMoney = input.paymentState === "paid" && typeof payload.totalCents !== "number";
    if ((current === target || TERMINAL.has(current)) && !needsMoney) continue;
    const paidCents = typeof payload.amountCents === "number" ? payload.amountCents : orderTotal?.totalCents;
    const method =
      input.method ??
      (typeof payload.method === "string" ? payload.method : null) ??
      (typeof payload.paymentLinkCode === "string" ? "card" : null);
    const money =
      target === "paid" && orderTotal && typeof paidCents === "number" && method
        ? paidMoneyFields({
            totalCents: orderTotal.totalCents,
            paidCents,
            currency: typeof payload.currency === "string" ? payload.currency : orderTotal.currency,
            method,
          })
        : {};
    const { error: updateErr } = await from("inquiry_messages")
      .update({ card_payload: { ...payload, ...money, state: target, settledAt: new Date().toISOString() } })
      .eq("id", row.id);
    if (updateErr) {
      logServerError("messaging.payment-card-sync/update", updateErr);
      return { ok: false, reason: "unavailable" };
    }
    updated += 1;
  }
  return { ok: true, updated };
}

/** Order totals are cents. Booking totals are major units. */
export async function loadSaleTotal(
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> };
    };
  },
  recordId: string,
): Promise<{ totalCents: number; currency: string } | null> {
  const { data: order } = await from("orders").select("total_cents, currency").eq("id", recordId).maybeSingle();
  const orderRow = order as { total_cents?: number; currency?: string } | null;
  if (orderRow && typeof orderRow.total_cents === "number" && typeof orderRow.currency === "string") {
    return { totalCents: orderRow.total_cents, currency: orderRow.currency };
  }
  const { data: booking } = await from("agency_bookings")
    .select("total_client_revenue, currency_code")
    .eq("id", recordId)
    .maybeSingle();
  const bookingRow = booking as { total_client_revenue?: number | string; currency_code?: string } | null;
  if (bookingRow && bookingRow.total_client_revenue != null && bookingRow.total_client_revenue !== "") {
    const major = Number(bookingRow.total_client_revenue);
    if (Number.isFinite(major)) {
      return { totalCents: Math.round(major * 100), currency: bookingRow.currency_code || "USD" };
    }
  }
  return null;
}

/** Fill a paid card on this inquiry from its booking. Used after cash or a transfer. */
export async function stampInquiryPaidCards(
  admin: Admin,
  input: { tenantId: string; inquiryId: string; method: string; paidCents?: number | null },
): Promise<void> {
  if (typeof admin.from !== "function") return;
  const from = (table: string) => admin.from!(table);
  const { data: booking } = await from("agency_bookings")
    .select("total_client_revenue, currency_code")
    .eq("tenant_id", input.tenantId)
    .eq("source_inquiry_id", input.inquiryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = booking as { total_client_revenue?: number | string; currency_code?: string } | null;
  if (!row || row.total_client_revenue == null) return;
  const major = Number(row.total_client_revenue);
  if (!Number.isFinite(major)) return;
  const totalCents = Math.round(major * 100);
  const currency = row.currency_code || "USD";
  const { data: cards } = await from("inquiry_messages")
    .select("id, card_payload")
    .eq("tenant_id", input.tenantId)
    .eq("inquiry_id", input.inquiryId)
    .eq("message_kind", "payment_request")
    .is("deleted_at", null);
  for (const card of (cards ?? []) as Array<{ id: string; card_payload: Record<string, unknown> | null }>) {
    const payload = card.card_payload && typeof card.card_payload === "object" ? card.card_payload : {};
    if (typeof payload.totalCents === "number" && typeof payload.method === "string") continue;
    const paidCents = typeof input.paidCents === "number"
      ? input.paidCents
      : typeof payload.amountCents === "number"
        ? payload.amountCents
        : totalCents;
    const { error } = await from("inquiry_messages")
      .update({
        card_payload: {
          ...payload,
          ...paidMoneyFields({ totalCents, paidCents, currency, method: input.method }),
          state: "paid",
          settledAt: new Date().toISOString(),
        },
      })
      .eq("id", card.id);
    if (error) logServerError("messaging.stampInquiryPaidCards", error);
  }
}
