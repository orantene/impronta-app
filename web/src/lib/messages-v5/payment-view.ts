/**
 * L7: pure helpers behind `PaymentRequestSheet` (D07/M05) and
 * `CancelRefundSheet` (D20/M10). No server action, no translator call —
 * every function is a plain transform over data the sheet already has, so
 * every branch is covered by a table test rather than a render test.
 */

import type { RecordChip } from "@/lib/messaging/types";

/* ------------------------------------------------------------- Deposit / amount */

/** The offer fields the deposit rule reads. Matches `OfferRow` (extended,
 * D-MSG-14x) from `lib/messaging/sheets.ts`. */
export type OfferDepositRule = {
  readonly status: string;
  readonly depositPct: number | null;
  readonly depositAmountCents: number | null;
  readonly totalClientPrice: number;
};

/** The inquiry's own accepted offer, or null. `loadInquiryOffers` already
 * orders newest first, so the first "accepted" row is the live one. */
export function selectAcceptedOffer<T extends { status: string }>(offers: readonly T[]): T | null {
  return offers.find((o) => o.status === "accepted") ?? null;
}

export type DepositAmount = { readonly amountCents: number; readonly pct: number | null };

/**
 * Deposit cents from the offer's own rule. `deposit_amount_cents` is the
 * server-derived, authoritative figure when the offer carries one
 * (`updateOfferDraft` in `lib/inquiry/inquiry-engine-offers.ts` stamps it as
 * `round(total_client_price_cents * depositPct / 100)`); this mirrors that
 * exact formula as a fallback for an offer that only carries `depositPct`.
 * Null when the offer has no deposit rule (owner decision 4: confirm/pay
 * without an override reason is then unblocked).
 */
export function depositFor(offer: OfferDepositRule | null): DepositAmount | null {
  if (!offer) return null;
  if (offer.depositAmountCents && offer.depositAmountCents > 0) {
    return { amountCents: Math.round(offer.depositAmountCents), pct: offer.depositPct ?? null };
  }
  if (offer.depositPct && offer.depositPct > 0) {
    return { amountCents: Math.round(offer.totalClientPrice * 100 * (offer.depositPct / 100)), pct: offer.depositPct };
  }
  return null;
}

/** The offer's own total, in cents. Null with no offer (the "Full" option
 * then reads as a bare label; the engine still resolves the order's own
 * total server-side when `amountCents` is sent as 0, D-row messaging-engine.ts). */
export function fullAmountCentsFor(offer: OfferDepositRule | null): number | null {
  return offer ? Math.round(offer.totalClientPrice * 100) : null;
}

export type AmountKind = "deposit" | "full" | "other";

export type AmountOption = {
  readonly kind: AmountKind;
  readonly amountCents: number | null;
  readonly pct?: number | null;
};

/** The amount ladder the sheet draws. Deposit is OMITTED, not disabled, when
 * the offer carries no rule (never a fake 0% row). Full and Other are always
 * offered. */
export function amountOptions(offer: OfferDepositRule | null): readonly AmountOption[] {
  const options: AmountOption[] = [];
  const deposit = depositFor(offer);
  if (deposit) options.push({ kind: "deposit", amountCents: deposit.amountCents, pct: deposit.pct });
  options.push({ kind: "full", amountCents: fullAmountCentsFor(offer) });
  options.push({ kind: "other", amountCents: null });
  return options;
}

/** "Other" field: dollars typed by staff to cents. Null on anything that is
 * not a real positive amount (blank, zero, negative, letters) so the sheet
 * can disable Send instead of minting a link for $0. */
export function dollarsToCents(input: string): number | null {
  const n = Number(input.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/* --------------------------------------------------------------------- Target */

const PAYABLE_TARGET_KINDS = ["order", "appointment", "reservation", "class_enrolment", "tickets", "offer"] as const;

export type PaymentTargetChip = Pick<RecordChip, "kind" | "recordId" | "label">;

/** Every chip this sheet can act on: the offer, an order, or a schedulable
 * record (never a bare `project`, which carries no money leg — mirrors the
 * same 5-of-7 gap S6/S3 already filed). */
export function paymentTargetsFrom(chips: readonly PaymentTargetChip[]): PaymentTargetChip[] {
  return chips.filter((c) => (PAYABLE_TARGET_KINDS as readonly string[]).includes(c.kind));
}

/** The record the sheet opens on: the order when one exists, else the first
 * target chip (an offer or a schedulable record). */
export function defaultPaymentTarget(chips: readonly PaymentTargetChip[]): PaymentTargetChip | null {
  const targets = paymentTargetsFrom(chips);
  return targets.find((c) => c.kind === "order") ?? targets[0] ?? null;
}

/**
 * A pay link and the POS "Collect here" deep link both need
 * `orderId = target.recordId`. That equality only holds for an `order` chip:
 * `RecordChip.recordId` for `appointment` / `reservation` / `class_enrolment`
 * / `tickets` is a booking or admission id (`syncConversationRecord` callers
 * across `lib/scheduling/cancel-booking.ts`, `lib/orders/purchase.ts`, etc.
 * all pass a booking/admission id for those kinds, never an `orders.id`),
 * and `offer` has no order until it converts. D-MSG-14x: bridging that other
 * id space needs a reader this lane does not build; "Record as paid
 * outside" still reaches those kinds through the inquiry-level fallback in
 * `messagingRecordOutsidePayment`.
 */
export function canMintPaymentLink(target: Pick<PaymentTargetChip, "kind"> | null): boolean {
  return target?.kind === "order";
}

/**
 * Owner rule: one open payment request at a time. Reads `RecordChip.paymentState`
 * (synced FROM `payment_links`/`orders` by `messaging_sync_record_state`, S2)
 * rather than a separate `payment_links` fetch — "requested" or "opened" on
 * any linked chip IS an open pay link.
 */
export function openRequestFor<T extends Pick<RecordChip, "paymentState">>(chips: readonly T[]): T | null {
  return chips.find((c) => c.paymentState === "requested" || c.paymentState === "opened") ?? null;
}

const CANCELLABLE_TARGET_KINDS = ["order", "appointment", "reservation", "class_enrolment", "tickets"] as const;

/** Every chip `CancelRefundSheet` can act on: the five `MONEY_RECORD_KINDS`
 * (`lib/messaging/money.ts`) — `offer` and `project` carry no money leg and
 * `messagingPreviewCancel` refuses them `invalid`. */
export function cancelTargetsFrom(chips: readonly PaymentTargetChip[]): PaymentTargetChip[] {
  return chips.filter((c) => (CANCELLABLE_TARGET_KINDS as readonly string[]).includes(c.kind));
}

export function defaultCancelTarget(chips: readonly PaymentTargetChip[]): PaymentTargetChip | null {
  return cancelTargetsFrom(chips)[0] ?? null;
}

/* ------------------------------------------------------------ Cancel / refund */

export type CancelPreviewLike = {
  readonly refundableCents: number;
  readonly depositRefundable: boolean;
};

export type RefundMode = "full" | "partial" | "keep";

export type RefundChoice = {
  readonly mode: RefundMode;
  readonly enabled: boolean;
  readonly maxCents: number;
};

/**
 * What the refund step offers, given the S6 preview. `depositRefundable`
 * false (an enforced cancellation window, still inside it) zeroes both money
 * choices; "keep" is always offered (staff can always cancel and keep the
 * money, with a reason the client sees).
 */
export function refundOptions(preview: CancelPreviewLike): readonly RefundChoice[] {
  const cap = preview.depositRefundable ? Math.max(0, Math.round(preview.refundableCents)) : 0;
  return [
    { mode: "full", enabled: cap > 0, maxCents: cap },
    { mode: "partial", enabled: cap > 0, maxCents: cap },
    { mode: "keep", enabled: true, maxCents: 0 },
  ];
}

/** A partial amount is valid only inside `(0, maxCents]`. */
export function partialAmountValid(amountCents: number | null, maxCents: number): boolean {
  return amountCents != null && amountCents > 0 && amountCents <= maxCents;
}

/** The footer button reads "Cancel and refund $X" only when money is
 * actually moving; a keep-mode or zero-refundable cancel reads "Cancel". */
export function footerLabelKindFor(mode: RefundMode, amountCents: number): "cancelAndRefund" | "cancelOnly" {
  return mode !== "keep" && amountCents > 0 ? "cancelAndRefund" : "cancelOnly";
}
