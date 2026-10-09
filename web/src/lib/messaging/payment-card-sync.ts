import "server-only";

import { logServerError } from "@/lib/server/safe-error";

import type { PaymentState } from "./lifecycle";
import { majorToMinorForDisplay } from "@/lib/inquiry/offer-minor-units";

/**
 * D-MSG-338 + A3 / audit §0.5 / SHELL-REQUESTS:
 * Mirror the chip's payment state onto the matching payment_request card only
 * (per request, matched by paymentLinkCode). Write expired / cancelled /
 * refunded / partially_refunded truthfully; paid payload carries
 * {total, paid, due, currency, method}.
 */

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from?: (table: string) => any;
  rpc?: unknown;
};

/** Card states written onto `card_payload.state`. */
export type PaymentCardState =
  | "paid"
  | "expired"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

const CARD_STATE_FOR: Partial<Record<PaymentState, PaymentCardState>> = {
  paid: "paid",
  partially_refunded: "partially_refunded",
  refunded: "refunded",
  expired: "expired",
};

/** Link statuses that belong to each card target (per-request match). */
const LINK_STATUS_FOR_CARD: Record<PaymentCardState, ReadonlySet<string>> = {
  paid: new Set(["paid"]),
  partially_refunded: new Set(["paid"]),
  refunded: new Set(["paid"]),
  expired: new Set(["expired"]),
  cancelled: new Set(["cancelled"]),
};

/** Never reopen Pay once money settled or staff cancelled. */
const TERMINAL = new Set<string>(["paid", "cancelled", "refunded", "partially_refunded"]);

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

/**
 * What the card was actually charged, when that is more than the service price (the client's
 * pass_through service fee rides on top). Stamped on the paid card so the thread says what was
 * charged, not just the price; {} when there is no fee to show.
 */
export function chargedFields(paidCents: number | null | undefined, chargedCents: number | null | undefined): { chargedCents?: number } {
  if (typeof paidCents !== "number" || typeof chargedCents !== "number") return {};
  return chargedCents > paidCents ? { chargedCents: Math.round(chargedCents) } : {};
}

/** Sum of the order's money-in rows (the card charge, fee included); null when unreadable. */
async function loadChargedCents(admin: Admin, orderId: string): Promise<number | null> {
  if (typeof admin.from !== "function") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.from("booking_transactions") as any)
      .select("gross_amount_cents, status, refund_of_transaction_id")
      .eq("order_id", orderId);
    if (error || !data) return null;
    const rows = (data as Array<{ gross_amount_cents: number | string | null; status: string; refund_of_transaction_id: string | null }>).filter(
      (r) => !r.refund_of_transaction_id && ["paid", "payout_pending", "payout_sent"].includes(r.status),
    );
    const sum = rows.reduce((n, r) => n + (Number(r.gross_amount_cents) || 0), 0);
    return sum > 0 ? sum : null;
  } catch {
    return null;
  }
}

export async function syncPaymentCardsForRecord(
  admin: Admin,
  input: { tenantId: string; recordId: string; paymentState: PaymentState | null; method?: string | null },
): Promise<PaymentCardSyncResult> {
  const target = input.paymentState ? CARD_STATE_FOR[input.paymentState] : undefined;
  if (!target || !input.tenantId || !input.recordId) return { ok: true, updated: 0 };
  if (typeof admin.from !== "function") return { ok: true, updated: 0 };
  const from = (table: string) => admin.from!(table);
  /** Outside cash/transfer: money settled without a paid link. */
  const outsideSettle = target === "paid" && Boolean(input.method);

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

  const relevantCodes = await loadRelevantLinkCodes(from, {
    tenantId: input.tenantId,
    orderId: input.recordId,
    target,
    outsideSettle,
  });

  const needsPaidMoney = target === "paid" || target === "partially_refunded" || target === "refunded";
  const orderTotal = needsPaidMoney ? await loadSaleTotal(from, input.recordId) : null;
  const orderCharged = target === "paid" ? await loadChargedCents(admin, input.recordId) : null;

  const cardRows = (cards ?? []) as Array<{ id: string; card_payload: Record<string, unknown> | null }>;
  const matching = cardsMatchingRequest(cardRows, relevantCodes);

  let updated = 0;
  for (const row of matching) {
    const payload = row.card_payload && typeof row.card_payload === "object" ? row.card_payload : {};
    const current = typeof payload.state === "string" ? payload.state : "sent";
    const needsMoney =
      needsPaidMoney &&
      (typeof payload.totalCents !== "number" || typeof payload.currency !== "string" || typeof payload.method !== "string");
    // Never reopen Pay. Allow paid → refunded / partially_refunded (truth), and
    // fill missing money fields on an already-paid card. Outside settle may
    // supersede a cancelled/expired request card when cash was recorded.
    const refundForward =
      current === "paid" && (target === "refunded" || target === "partially_refunded");
    const outsidePaid =
      outsideSettle && (current === "cancelled" || current === "expired" || current === "sent");
    if (TERMINAL.has(current) && current !== target && !needsMoney && !refundForward && !outsidePaid) continue;
    if (current === target && !needsMoney) continue;

    const paidCents = typeof payload.amountCents === "number" ? payload.amountCents : orderTotal?.totalCents;
    const method =
      input.method ??
      (typeof payload.method === "string" ? payload.method : null) ??
      (typeof payload.paymentLinkCode === "string" ? "card" : null);
    const currency =
      typeof payload.currency === "string" && payload.currency
        ? payload.currency
        : orderTotal?.currency ?? "USD";
    const money =
      needsPaidMoney && orderTotal && typeof paidCents === "number" && method
        ? paidMoneyFields({
            totalCents: orderTotal.totalCents,
            paidCents,
            currency,
            method,
          })
        : typeof payload.currency !== "string" && currency
          ? { currency }
          : {};

    const next: Record<string, unknown> = {
      ...payload,
      ...money,
      state: target,
      currency: (money as { currency?: string }).currency ?? currency,
    };
    if (needsPaidMoney) next.settledAt = new Date().toISOString();
    Object.assign(next, chargedFields(typeof paidCents === "number" ? paidCents : null, orderCharged));

    const { error: updateErr } = await from("inquiry_messages")
      .update({ card_payload: next })
      .eq("id", row.id);
    if (updateErr) {
      logServerError("messaging.payment-card-sync/update", updateErr);
      return { ok: false, reason: "unavailable" };
    }
    updated += 1;
  }
  return { ok: true, updated };
}

/**
 * Prefer cards whose paymentLinkCode matches links in the target status.
 * If no codes resolve (booking cash path / legacy), update every unsettled card
 * only when there is a single candidate — never flip a sibling request.
 */
export function cardsMatchingRequest(
  cards: Array<{ id: string; card_payload: Record<string, unknown> | null }>,
  relevantCodes: ReadonlySet<string> | null,
): Array<{ id: string; card_payload: Record<string, unknown> | null }> {
  if (relevantCodes && relevantCodes.size > 0) {
    const matched = cards.filter((row) => {
      const code = row.card_payload && typeof row.card_payload === "object" ? row.card_payload.paymentLinkCode : null;
      return typeof code === "string" && relevantCodes.has(code);
    });
    if (matched.length > 0) return matched;
    // Codes known but no card carries them — leave siblings alone.
    return [];
  }
  if (cards.length <= 1) return cards;
  // Multiple requests, no link filter: do not guess.
  return [];
}

async function loadRelevantLinkCodes(
  from: (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (cols: string) => any;
  },
  input: { tenantId: string; orderId: string; target: PaymentCardState; outsideSettle?: boolean },
): Promise<Set<string> | null> {
  // Outside cash: the open link was often cancelled first, so "paid" status
  // codes are empty. Include the superseded link statuses so the matching
  // payment_request card still flips to Pagado.
  const statuses = input.outsideSettle
    ? new Set(["paid", "cancelled", "expired", "open", "replaced"])
    : LINK_STATUS_FOR_CARD[input.target];
  try {
    // Appointment sync passes bookingId as recordId; payment_links are keyed
    // by order_id. Resolve booking → order when the id is a booking row.
    let orderId = input.orderId;
    const { data: booking } = await from("agency_bookings").select("order_id").eq("id", orderId).maybeSingle();
    const bookingOrderId = (booking as { order_id?: string | null } | null)?.order_id;
    if (typeof bookingOrderId === "string" && bookingOrderId) orderId = bookingOrderId;

    const { data, error } = await from("payment_links")
      .select("code, status")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", orderId);
    if (error || !data) return null;
    const codes = new Set<string>();
    for (const row of data as Array<{ code?: string; status?: string }>) {
      if (row.code && row.status && statuses.has(row.status)) codes.add(row.code);
    }
    return codes;
  } catch {
    return null;
  }
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
      const bookingCurrency = bookingRow.currency_code || "USD";
      return { totalCents: majorToMinorForDisplay(major, bookingCurrency), currency: bookingCurrency };
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
  const currency = row.currency_code || "USD";
  const totalCents = majorToMinorForDisplay(major, currency);
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
