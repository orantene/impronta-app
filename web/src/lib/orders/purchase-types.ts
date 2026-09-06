/**
 * The purchase pipeline's contract: what a caller passes in, and what it can
 * get back.
 *
 * Split out of `purchase.ts` when that file hit its 800-line cap for the third
 * time. Types are the right thing to move: ninety lines with no runtime
 * coupling, and a caller reading the contract no longer has to scroll past the
 * orchestration to find it.
 *
 * The alternative was shaving comments to fit, which I did three times before
 * admitting it was the wrong move. "Trim waste, do not raise budgets" is about
 * WASTE — the reasoning in this pipeline is why the next person will not
 * reintroduce a bug it already has, and deleting it to buy lines is paying the
 * wrong debt.
 */
import type { CapacityRefusalReason } from "@/lib/capacity/types";
import type { PaymentChoice } from "@/lib/orders/purchase-policy";

export type { PaymentChoice };

export type PurchaseLineInput = {
  offeringId: string;
  units: number;
  variantId?: string | null;
  addonIds?: string[];
  /**
   * `order_lines.session_id` — THE BINDING for ticketing. `mint-on-paid` mints
   * only for lines where this is set: without it a session purchase yields an
   * order, a charge, a seat, and NO TICKET.
   */
  sessionId?: string | null;
};

export type PurchaseInput = {
  tenantId: string;
  /** Per CART, not per click — the idempotency anchor. */
  clientOrderKey: string;
  /** Null for a guest. Never invented. */
  actorUserId: string | null;
  contact: { email?: string | null; phone?: string | null; displayName?: string | null };
  lines: PurchaseLineInput[];
  /** INTENT, not policy. Re-validated against the offering rows. */
  paymentChoice: PaymentChoice;
  sourceChannel: string;
  sourcePage?: string | null;
  /** Capacity pools this purchase must hold, per line. */
  capacity?: Array<{
    offeringId: string;
    poolId: string;
    startsAt?: string | null;
    endsAt?: string | null;
    units?: number;
    /** Per-unit domain row exists (an admission per seat)? See capacity-requests.ts. */
    perUnitDomainRow?: boolean;
  }>;
  /**
   * Seconds the capacity hold should live, overriding the pools' own TTL.
   *
   * For a pay-at-the-door order the ruling is HOLD at creation, COMMIT at
   * settlement, with the hold lasting until the event's door time. A commit has
   * no TTL and nothing reclaims it, so committing early turns an abandoned
   * click into a seat sold forever, indistinguishable from real demand.
   *
   * CLAMPED, never trusted. Absent means the pools' own shortest TTL.
   */
  holdTtlSecondsOverride?: number | null;
  /**
   * A code the buyer typed. Optional, and when present it is HONOURED OR THE
   * PURCHASE REFUSES — never quietly dropped. Someone who entered a code and
   * was charged full price has been overcharged by silence.
   */
  promoCode?: string | null;
  locale?: string | null;
  /**
   * Open a conversation for this purchase and post the order card into it.
   *
   * "Any order can open a thread lazily" is the contract; this is the eager
   * form, for channels where staff work the order in Messages today. A menu
   * order takes it, because that is where a menu order is visible NOW, and
   * removing the thread would be a regression dressed as an architecture change.
   *
   * What it does NOT do is run the inquiry state machine: no offer, no approval,
   * no `status: 'approved'` forced under the service role, no version dance.
   * The inquiry here is a CONVERSATION, which is all it was ever needed for.
   */
  openThread?: boolean;
  /**
   * A CALENDAR SLOT this purchase must hold, distinct from capacity units.
   *
   * Capacity answers "are there seats left"; a slot answers "is this person
   * free at this time". A timed appointment needs both, and the instant-book
   * engine held them separately with its own compensation — the one thing it
   * did that Menu never needed.
   *
   * The TTL comes from the POOL, not from this file, so the two clocks agree.
   * Capacity's warning: hold the slot on its own timer and the units come back
   * in fifteen minutes while the slot stays blocked for two days.
   */
  reservation?: {
    talentProfileId: string;
    startsAt: string;
    endsAt: string;
    title?: string | null;
    /** The pool whose TTL governs both holds. */
    poolId?: string | null;
  } | null;
};

export type PurchaseRefusalReason =
  | "empty_order"
  | "unknown_offering"
  | "offering_not_published"
  | "cross_tenant_line"
  | "account_required"
  | "pay_in_person_not_allowed"
  | "deposit_not_offered"
  | "invalid_units"
  | "invalid_payment_choice"
  | "offering_not_priceable"
  | "variant_not_on_offering"
  | "addon_not_on_offering"
  | "amount_out_of_range"
  | "no_contact"
  | "sold_out"
  /** The capacity engine could not be REACHED. A retry, not an absence. */
  | "capacity_unavailable"
  /** Someone else holds that time. Distinct from sold_out: seats remain. */
  | "slot_taken"
  /** A timed offering was booked with no slot. A caller bug OR a stale UI. */
  | "slot_required"
  /** Promo refusals. A code the buyer TYPED must never be silently ignored. */
  | "promo_unknown"
  | "promo_not_started"
  | "promo_expired"
  | "promo_exhausted"
  | "promo_customer_limit"
  | "promo_not_applicable"
  /** The promo READ failed. A retry, not a verdict on the code. */
  | "promo_unavailable"
  | "engine_error";

export type PurchaseResult =
  | {
      ok: true;
      orderId: string;
      customerId: string;
      totalCents: number;
      /** What the pipeline decided to collect now. Derived, never sent. */
      collectCents: number;
      /** True when the order is reserved with no card. */
      payInPerson: boolean;
      allocationIds: string[];
      /**
       * The transaction to charge, when there is money to collect. Null for a
       * free reserve or pay-in-person.
       *
       * Stripe is deliberately NOT called from this pipeline: the caller passes
       * this to `createCheckoutSessionForTransaction`, which already carries the
       * `cs_txn_<id>` idempotency key. Keeping the network call out of the
       * orchestrator is what makes the orchestrator testable, and it means there
       * is still exactly one place that talks to Checkout.
       */
      transactionId: string | null;
      /** The operations anchor. See the note at step 9. */
      bookingId: string | null;
      /** The conversation, when one was opened. */
      inquiryId: string | null;
      /** The calendar hold, when a slot was taken. */
      reservationHoldId: string | null;
    }
  | { ok: false; reason: PurchaseRefusalReason; offeringId?: string; error?: string };

/** Only used when a pool cannot tell us its own TTL. */
