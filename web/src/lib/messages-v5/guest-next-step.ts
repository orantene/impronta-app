/**
 * L13 · the ONE next step the guest dock shows above the composer, derived
 * from state (owner decision 7: tasks come from state, never free text). Pure
 * and client-safe; the dock renders it with the kit's NextStepBlock and wires
 * the action to the same card actions the cards use.
 *
 * Order of precedence, first match wins:
 *   0. an engine outcome card (Declined / Pay failed / Refunded)
 *   1. an open payment link            → Pay {amount}
 *   2. an offer waiting on the client  → Accept offer v{n} · {total}
 *   3. a held time not yet confirmed   → Waiting for {business} to confirm (no button)
 *   4. a confirmed record              → You're booked · {date} (no button)
 *   5. sent, nothing to do             → null (the block is hidden)
 * A draft that has not been sent is the SendToAgencyBar's job, not this one.
 */

import type { ClientOfferSummary } from "./client-thread-view";
import { offerCardState, offerDepositCents } from "./client-thread-view";
import {
  deriveGuestOutcomeFromMessages,
  type GuestOutcomeKind,
  type GuestOutcomeMessage,
} from "./guest-outcome";

export type GuestNextStepKind =
  | "pay"
  | "accept_offer"
  | "waiting_confirm"
  | "booked"
  | "paid"
  | "refunded"
  | "declined"
  | "pay_failed";

export type GuestNextStep = {
  readonly kind: GuestNextStepKind;
  /** The values the dock's copy keys interpolate. */
  readonly values: Readonly<Record<string, string>>;
  /** The offer the action is about, for `accept_offer`. */
  readonly offer?: ClientOfferSummary;
  /** The pay code, for `pay`. */
  readonly payCode?: string;
};

export type GuestNextStepInput = {
  readonly threadStatus: string;
  readonly offers: readonly ClientOfferSummary[];
  readonly payCode: string | null;
  /** The `professional_times` payloads in the thread (a pick holds a slot). */
  readonly timesPayloads: readonly (Record<string, unknown> | null)[];
  readonly records: readonly { readonly fulfilmentState: string | null; readonly recordDate: string | null }[];
  /**
   * @deprecated Prefer `messages`. Kept so older callers that only passed
   * phantom kinds (`offer_declined` / `payment_failed` / `refunded`) still work.
   */
  readonly messageKinds?: readonly string[];
  /** Real engine rows — outcomes are classified from kind + payload. */
  readonly messages?: readonly GuestOutcomeMessage[];
  readonly now: Date;
  readonly money: (cents: number, currency: string) => string;
  readonly date: (iso: string) => string;
};

function pendingOffer(offers: readonly ClientOfferSummary[], now: Date): ClientOfferSummary | null {
  // Newest first: a v2 supersedes v1 on the same inquiry.
  for (let i = offers.length - 1; i >= 0; i -= 1) {
    if (offerCardState(offers[i], now) === "sent") return offers[i];
  }
  return null;
}

function latestAccepted(offers: readonly ClientOfferSummary[]): ClientOfferSummary | null {
  for (let i = offers.length - 1; i >= 0; i -= 1) {
    if (offers[i].status === "accepted") return offers[i];
  }
  return null;
}

function heldTime(payloads: readonly (Record<string, unknown> | null)[], now: Date): boolean {
  return payloads.some((p) => {
    const exp = typeof p?.holdExpiresAt === "string" ? Date.parse(p.holdExpiresAt) : NaN;
    const picked = typeof p?.pickedStartsAt === "string" || typeof p?.picked === "string";
    return picked && Number.isFinite(exp) && exp > now.getTime();
  });
}

function legacyOutcomeFromKinds(kinds: readonly string[]): GuestOutcomeKind | null {
  if (kinds.includes("refunded")) return "refunded";
  if (kinds.includes("offer_declined")) return "declined";
  if (kinds.includes("payment_failed")) return "pay_failed";
  return null;
}

function threadOutcome(input: GuestNextStepInput): GuestOutcomeKind | null {
  if (input.messages && input.messages.length > 0) {
    return deriveGuestOutcomeFromMessages(input.messages);
  }
  // Declined live offer with no change_result/offer_state row yet.
  for (let i = input.offers.length - 1; i >= 0; i -= 1) {
    if (offerCardState(input.offers[i]!, input.now) === "declined") return "declined";
  }
  return legacyOutcomeFromKinds(input.messageKinds ?? []);
}

export function deriveGuestNextStep(input: GuestNextStepInput): GuestNextStep | null {
  const { now } = input;
  if (input.threadStatus === "draft" || input.threadStatus === "closed") return null;

  const kinds = input.messageKinds ?? [];
  const outcome = threadOutcome(input);
  if (outcome === "refunded") return { kind: "refunded", values: {} };
  if (outcome === "declined") return { kind: "declined", values: {} };
  if (outcome === "pay_failed") return { kind: "pay_failed", values: {} };
  if (kinds.includes("payment_paid") || (input.messages ?? []).some((m) => m.kind === "payment_paid")) {
    return { kind: "paid", values: {} };
  }

  const offer = pendingOffer(input.offers, now);
  if (input.payCode) {
    // The amount comes from the offer the link is about: the pending one, or
    // (once accepted) the newest accepted one. Live 2026-09-18 the title read
    // a bare "Pay" because only the pending offer was consulted.
    const about = offer ?? latestAccepted(input.offers);
    const deposit = about ? offerDepositCents(about) : null;
    const amount = about ? (deposit ?? about.totalCents) : null;
    return {
      kind: "pay",
      payCode: input.payCode,
      values: { amount: amount != null && about ? input.money(amount, about.currency) : "" },
    };
  }
  if (offer) {
    return {
      kind: "accept_offer",
      offer,
      values: { version: String(offer.version), total: input.money(offer.totalCents, offer.currency) },
    };
  }
  if (heldTime(input.timesPayloads, now)) return { kind: "waiting_confirm", values: {} };

  const booked = input.records.find((r) => r.fulfilmentState === "confirmed" || r.fulfilmentState === "seated" || r.fulfilmentState === "checked_in");
  if (booked) return { kind: "booked", values: { date: booked.recordDate ? input.date(booked.recordDate) : "" } };
  return null;
}
