/**
 * Accept -> order -> pay card. The orchestration only; every write goes
 * through an injected store whose production implementation
 * (`accept-offer-payment.ts`) calls the writers the Messages pay flow
 * already uses: `createDraftOrder` (the shared Messages draft),
 * `linkRecordToConversation`, `createPaymentLink` (Stripe test/live
 * checkout behind `/pay/<code>`) and a `payment_request` card with the same
 * payload `messagingRequestPayment` posts.
 *
 * Idempotent by construction:
 *   - the order is found by its offer key before one is created;
 *   - the link is minted with a fixed key per offer version, so
 *     `createPaymentLink` hands back the same open link (`already`);
 *   - the card is posted only when the link is new, or when no card for
 *     this offer exists yet (pay in person).
 */

import { acceptAmountLabel, planAcceptCollection, type AcceptCollection, type AcceptPolicyLine } from "./accept-offer-collection";

export type AcceptOfferForPayment = {
  id: string;
  version: number;
  totalCents: number;
  currency: string;
  depositPct: number | null;
  depositCents: number | null;
};

export type AcceptPaymentStore = {
  loadPolicy(): Promise<{ ok: true; lines: AcceptPolicyLine[]; talentDefaults: unknown } | { ok: false }>;
  findOfferOrder(orderKey: string): Promise<string | null>;
  createOfferOrder(input: { orderKey: string; totalCents: number; currency: string }): Promise<{ ok: true; orderId: string } | { ok: false }>;
  mintLink(input: { orderId: string; amountCents: number; idempotencyKey: string }): Promise<
    { ok: true; code: string; amountCents: number; expiresAt: string; already: boolean } | { ok: false; reason: string }
  >;
  hasCardFor(kind: "booking_confirmed" | "payment_request", offerId: string): Promise<boolean>;
  postCard(input: { kind: "booking_confirmed" | "payment_request"; body: string; payload: Record<string, unknown> }): Promise<void>;
};

export type AcceptPaymentResult =
  | { ok: true; collection: AcceptCollection; payCode: string | null; orderId: string | null; cardPosted: boolean }
  | { ok: false; reason: "policy_unavailable" | "order_unavailable" | "link_unavailable"; collection?: AcceptCollection };

export function offerOrderKey(offerId: string): string {
  return `offer_accept:${offerId}`;
}

export function offerLinkKey(offerId: string, version: number): string {
  return `offer-accept:${offerId}:v${version}`;
}

export async function runAcceptOfferPayment(store: AcceptPaymentStore, offer: AcceptOfferForPayment): Promise<AcceptPaymentResult> {
  const policy = await store.loadPolicy();
  if (!policy.ok) return { ok: false, reason: "policy_unavailable" };
  const collection = planAcceptCollection({
    totalCents: offer.totalCents,
    offerDepositPct: offer.depositPct,
    offerDepositCents: offer.depositCents,
    lines: policy.lines,
    talentDefaults: policy.talentDefaults,
  });

  if (collection.collect === "none") {
    // Pay in person / free reserve: confirmed, no link. One card per offer.
    if (await store.hasCardFor("booking_confirmed", offer.id)) {
      return { ok: true, collection, payCode: null, orderId: null, cardPosted: false };
    }
    await store.postCard({
      kind: "booking_confirmed",
      body: "Confirmed. You pay in person.",
      payload: { state: "sent", offerId: offer.id, version: offer.version, payInPerson: true, totalCents: offer.totalCents, currency: offer.currency },
    });
    return { ok: true, collection, payCode: null, orderId: null, cardPosted: true };
  }

  const orderKey = offerOrderKey(offer.id);
  let orderId = await store.findOfferOrder(orderKey);
  if (!orderId) {
    const created = await store.createOfferOrder({ orderKey, totalCents: offer.totalCents, currency: offer.currency });
    if (!created.ok) {
      // A concurrent accept may have just created it.
      orderId = await store.findOfferOrder(orderKey);
      if (!orderId) return { ok: false, reason: "order_unavailable", collection };
    } else {
      orderId = created.orderId;
    }
  }

  const minted = await store.mintLink({ orderId, amountCents: collection.amountCents, idempotencyKey: offerLinkKey(offer.id, offer.version) });
  if (!minted.ok) return { ok: false, reason: "link_unavailable", collection };

  let cardPosted = false;
  if (!minted.already || !(await store.hasCardFor("payment_request", offer.id))) {
    await store.postCard({
      kind: "payment_request",
      body: acceptAmountLabel(minted.amountCents, offer.currency),
      payload: {
        state: "sent",
        paymentLinkCode: minted.code,
        amountCents: minted.amountCents,
        amountKind: collection.collect,
        amount_label: acceptAmountLabel(minted.amountCents, offer.currency),
        expiresAt: minted.expiresAt,
        currency: offer.currency,
        offerId: offer.id,
        orderId,
      },
    });
    cardPosted = true;
  }
  return { ok: true, collection, payCode: minted.code, orderId, cardPosted };
}
