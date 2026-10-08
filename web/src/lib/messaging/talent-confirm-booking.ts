/**
 * A solo talent turns an ACCEPTED offer into the booking plus the payment
 * request, from her own inbox thread. Orchestration only, no I/O: every read
 * and the one write go through an injected store.
 *
 * NO new money logic. The one write is `ensureAcceptedOfferPayment`
 * (accept-offer-payment.ts), the SAME function the client's own accept and
 * "send me the pay link" run (messaging-client.ts `payAfterAccept`): the order,
 * the booking behind it, the `/pay/<code>` link and the payment card, all
 * idempotent per offer version. The amount asked comes from the same
 * `planAcceptCollection`. This file only decides WHEN she may run it.
 *
 * Distinct refusals: not_owner, not_accepted, already_converted (idempotent,
 * returns the existing booking), payment_link_failed (booking exists, only the
 * payment request is missing, so the control retries just that part).
 */

import { acceptAmountLabel } from "./accept-offer-collection";
import type { AcceptCollection } from "./accept-offer-collection";
import type { AcceptOfferForPayment, AcceptPaymentResult } from "./accept-offer-payment-core";
import { decideConfirmBookingState, type ConfirmBookingState } from "@/lib/messages-v5/confirm-booking-state";

export type ConfirmBookingError =
  | "not_owner"
  | "not_accepted"
  | "already_converted"
  | "payment_link_failed"
  | "booking_failed"
  | "unavailable"
  | "impersonating";

export type ConfirmBookingResult =
  | { ok: true; bookingId: string; payCode: string | null; payInPerson: boolean; needsTime: boolean }
  | { ok: false; error: ConfirmBookingError; bookingId?: string | null };

/** The newest offer on the inquiry, as the store reads it (money in cents). */
export type ConfirmOfferRow = {
  id: string;
  version: number;
  status: string;
  totalCents: number;
  /** Null means the row carries no currency: the flow refuses rather than guess one. */
  currency: string | null;
  createdByUserId: string | null;
  depositPct: number | null;
  depositCents: number | null;
  /** Talent ids on the offer's lines (null lines are not listed). */
  lineTalentIds: string[];
};

export type ConfirmFacts = {
  offer: ConfirmOfferRow | null;
  /** `ours` = booking behind an order; `foreign` = a booking with no order (another path owns it). */
  booking: { id: string; origin: "ours" | "foreign" } | null;
  /** A payment_request card or the pay-in-person confirmation exists for the offer. */
  paymentRequested: boolean;
};

export type ConfirmBookingStore = {
  loadFacts(): Promise<{ ok: true; facts: ConfirmFacts } | { ok: false }>;
  /** The write: `ensureAcceptedOfferPayment` with the offer's own fields. */
  run(offer: AcceptOfferForPayment, createdByUserId: string | null): Promise<AcceptPaymentResult>;
  /** Read-only: what the pay request will ask for (`planAcceptCollection`); null when unreadable. */
  previewCollection(offer: AcceptOfferForPayment, createdByUserId: string | null): Promise<AcceptCollection | null>;
};

/** The same mapping `payAfterAccept` (messaging-client.ts) applies; a static test pins them equal. */
export function acceptOfferFromRow(row: ConfirmOfferRow): AcceptOfferForPayment | null {
  const currency = (row.currency ?? "").trim().toUpperCase();
  if (!currency) return null;
  return {
    id: row.id,
    version: row.version,
    totalCents: row.totalCents,
    currency,
    depositPct: row.depositPct,
    depositCents: row.depositCents,
  };
}

/** PURE: may this signed-in participant act as the seller. Invited or declined seats may not. */
export function talentMaySell(input: { isSeller: boolean; participantStatus: string }): boolean {
  if (!input.isSeller) return false;
  return input.participantStatus !== "invited" && input.participantStatus !== "declined";
}

/** PURE: every line on the offer is hers (an unassigned line is hers by default). */
export function offerLinesAreHers(lineTalentIds: readonly string[], talentProfileId: string): boolean {
  return lineTalentIds.every((id) => id === talentProfileId);
}

export type ConfirmStateView = {
  state: ConfirmBookingState;
  bookingId: string | null;
  /** What the client will be asked for, formatted like the pay card; null when nothing is collected online. */
  amountLabel: string | null;
  collect: "none" | "deposit" | "full" | null;
};

const HIDDEN: ConfirmStateView = { state: "hidden", bookingId: null, amountLabel: null, collect: null };

/** What the control shows. `mayAct` is the server-verified ownership, resolved by the caller. */
export async function loadConfirmState(
  store: ConfirmBookingStore,
  input: { mayAct: boolean; talentProfileId: string },
): Promise<{ ok: true; view: ConfirmStateView } | { ok: false }> {
  if (!input.mayAct) return { ok: true, view: HIDDEN };
  const loaded = await store.loadFacts();
  if (!loaded.ok) return { ok: false };
  const { offer, booking, paymentRequested } = loaded.facts;
  const state = decideConfirmBookingState({
    ownerSeller: Boolean(offer) && offerLinesAreHers(offer?.lineTalentIds ?? [], input.talentProfileId),
    offerStatus: offer?.status ?? null,
    booking: booking?.origin ?? "none",
    paymentRequested,
  });
  if (state === "hidden") return { ok: true, view: HIDDEN };
  const accept = offer ? acceptOfferFromRow(offer) : null;
  if (!offer || !accept) return { ok: true, view: HIDDEN };
  // Read for `done` too: pay in person says so in the status line.
  const plan = await store.previewCollection(accept, offer.createdByUserId);
  const collect = plan ? plan.collect : null;
  return {
    ok: true,
    view: {
      state,
      bookingId: booking?.id ?? null,
      amountLabel: plan && plan.collect !== "none" ? acceptAmountLabel(plan.amountCents, accept.currency) : null,
      collect,
    },
  };
}

/** Run the conversion. `mayAct` is the server-verified ownership, resolved by the caller. */
export async function confirmAcceptedOffer(
  store: ConfirmBookingStore,
  input: { mayAct: boolean; talentProfileId: string },
): Promise<ConfirmBookingResult> {
  if (!input.mayAct) return { ok: false, error: "not_owner" };
  const loaded = await store.loadFacts();
  if (!loaded.ok) return { ok: false, error: "unavailable" };
  const { offer, booking, paymentRequested } = loaded.facts;

  // A booking made by another path is never touched: report it, create nothing.
  if (booking?.origin === "foreign") return { ok: false, error: "already_converted", bookingId: booking.id };
  if (!offer) return { ok: false, error: "not_accepted" };
  if (!offerLinesAreHers(offer.lineTalentIds, input.talentProfileId)) return { ok: false, error: "not_owner" };
  if (booking && paymentRequested && (offer.status === "accepted" || offer.status === "booked")) {
    return { ok: false, error: "already_converted", bookingId: booking.id };
  }
  if (offer.status !== "accepted") return { ok: false, error: "not_accepted" };

  const accept = acceptOfferFromRow(offer);
  if (!accept) return { ok: false, error: "unavailable" };

  const result = await store.run(accept, offer.createdByUserId);
  if (result.ok) {
    const bookingId = result.bookingId ?? booking?.id ?? null;
    if (!bookingId) return { ok: false, error: "booking_failed" };
    return {
      ok: true,
      bookingId,
      payCode: result.payCode,
      payInPerson: result.collection.collect === "none",
      needsTime: !result.scheduled,
    };
  }
  if (result.reason === "link_unavailable") {
    // The booking is written BEFORE the link (accept-offer-payment-core), so it stands.
    const again = await store.loadFacts();
    const bookingId = again.ok ? (again.facts.booking?.id ?? null) : (booking?.id ?? null);
    return { ok: false, error: "payment_link_failed", bookingId };
  }
  if (result.reason === "policy_unavailable") return { ok: false, error: "unavailable" };
  return { ok: false, error: "booking_failed" };
}
