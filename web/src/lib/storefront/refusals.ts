/**
 * refusals.ts — ONE mapper from every engine refusal shape to what a widget
 * shows.
 *
 * Every engine behind the storefront widgets returns its own vocabulary:
 * `createPurchase` says `sold_out`, the capacity engine says `ancestor_full`,
 * the reservations engine says `no_band_fits_this_party`, the waitlist desk
 * says `seatsAvailable`, Postgres says `23514`. A widget has SIX states and
 * one of them is "refused", so the widget needs one small set of reasons it
 * can branch on, and a sentence it can print without knowing which engine
 * spoke.
 *
 * FIVE REASONS, AND EACH IS A DIFFERENT NEXT MOVE FOR THE PERSON.
 *   full               that is gone; choose a different thing
 *   past               that time is over or not offered any more; choose a later one
 *   conflict           this just changed under you; reload and look again
 *   identity_required  tell us who you are, then try the same thing again
 *   refused            the engine said no for a reason you cannot fix by
 *                      retrying the same thing (policy, quantity, promo, fault)
 *
 * `code` is kept on the result. The UI must never print it, but a test, a log
 * line and the Exceptions inbox all want the engine's own word.
 *
 * TEXT COMES FROM THE MESSAGE CATALOGUES (`web/messages/{en,es}.json`) under
 * `public.storefront.refusal.*`, read through `createTranslator`. The keys are
 * written as literals in the table below so `message-key-usage.static.test.ts`
 * can see every one of them; a templated key would be invisible to that guard.
 *
 * AN UNKNOWN CODE IS NOT A SUCCESS AND NOT A CRASH. Anything this table has
 * never seen folds into `refused` with the generic "we could not do that,
 * nothing was changed" line. It must never fold into `full` or `past`, because
 * those tell a person to go and pick something else when the truth may be
 * that we were simply unreachable.
 */

import { createTranslator } from "@/i18n/messages";

export type StorefrontRefusalReason =
  | "full"
  | "past"
  | "conflict"
  | "identity_required"
  | "refused";

export type StorefrontRefusal = {
  ok: false;
  reason: StorefrontRefusalReason;
  /** The engine's own word. Never rendered; kept for logs and tests. */
  code: string;
  message: string;
};

/** Postgres CHECK violation; the two orders CHECKs that gate identity. */
const PG_CHECK_VIOLATION = "23514";
const IDENTITY_CONSTRAINTS = [
  "orders_identified_before_payment",
  "orders_draft_has_an_identity",
  "orders_require_identity_for_lines",
] as const;

type Entry = { reason: StorefrontRefusalReason; key: string };

/**
 * Engine code → (reason, message key). Several codes share a sentence on
 * purpose: `not_found` and `wrong_tenant` are two facts inside the engine and
 * ONE fact on a public page, and naming the second would say something about
 * another workspace's data.
 */
const TABLE: Readonly<Record<string, Entry>> = {
  // ── full: gone, choose differently ─────────────────────────────────────
  sold_out: { reason: "full", key: "public.storefront.refusal.soldOut" },
  ancestor_full: { reason: "full", key: "public.storefront.refusal.soldOut" },
  fully_booked: { reason: "full", key: "public.storefront.refusal.fullyBooked" },
  session_full: { reason: "full", key: "public.storefront.refusal.fullyBooked" },
  sessionFull: { reason: "full", key: "public.storefront.refusal.fullyBooked" },
  no_place: { reason: "full", key: "public.storefront.refusal.fullyBooked" },
  slot_taken: { reason: "full", key: "public.storefront.refusal.slotTaken" },
  seat_taken: { reason: "full", key: "public.storefront.refusal.seatTaken" },
  no_band_fits_this_party: { reason: "full", key: "public.storefront.refusal.noTableThatSize" },
  no_seats_configured: { reason: "full", key: "public.storefront.refusal.noSeatsOnSale" },
  noSeatsSet: { reason: "full", key: "public.storefront.refusal.noSeatsOnSale" },
  no_pool: { reason: "full", key: "public.storefront.refusal.noSeatsOnSale" },
  noPool: { reason: "full", key: "public.storefront.refusal.noSeatsOnSale" },
  pool_inactive: { reason: "full", key: "public.storefront.refusal.noSeatsOnSale" },
  pool_not_found: { reason: "full", key: "public.storefront.refusal.noSeatsOnSale" },

  // ── past: over, or not offered any more ───────────────────────────────
  past: { reason: "past", key: "public.storefront.refusal.past" },
  session_already_ended: { reason: "past", key: "public.storefront.refusal.past" },
  ended: { reason: "past", key: "public.storefront.refusal.past" },
  session_not_open: { reason: "past", key: "public.storefront.refusal.notOpen" },
  sessionNotOpen: { reason: "past", key: "public.storefront.refusal.notOpen" },
  not_open: { reason: "past", key: "public.storefront.refusal.notOpen" },
  night_not_on_sale: { reason: "past", key: "public.storefront.refusal.notOnSale" },
  tier_not_on_sale: { reason: "past", key: "public.storefront.refusal.notOnSale" },
  scheduled: { reason: "past", key: "public.storefront.refusal.notOnSale" },
  time_not_offered: { reason: "past", key: "public.storefront.refusal.timeNotOffered" },
  inside_minimum_notice: { reason: "past", key: "public.storefront.refusal.tooLate" },
  closed: { reason: "past", key: "public.storefront.refusal.closed" },
  closed_in_window: { reason: "past", key: "public.storefront.refusal.closed" },
  beyond_booking_horizon: { reason: "past", key: "public.storefront.refusal.tooFarAhead" },
  hold_expired: { reason: "past", key: "public.storefront.refusal.holdExpired" },
  offer_expired: { reason: "past", key: "public.storefront.refusal.offerExpired" },
  expired: { reason: "past", key: "public.storefront.refusal.offerExpired" },
  not_offered: { reason: "past", key: "public.storefront.refusal.offerExpired" },

  // ── conflict: reload and look again ───────────────────────────────────
  conflict: { reason: "conflict", key: "public.storefront.refusal.conflict" },
  changedSinceOpened: { reason: "conflict", key: "public.storefront.refusal.conflict" },
  version_stale: { reason: "conflict", key: "public.storefront.refusal.conflict" },
  basket_changed: { reason: "conflict", key: "public.storefront.refusal.conflict" },
  fingerprint_mismatch: { reason: "conflict", key: "public.storefront.refusal.conflict" },
  in_flight: { reason: "conflict", key: "public.storefront.refusal.inFlight" },
  fenced: { reason: "conflict", key: "public.storefront.refusal.inFlight" },
  superseded: { reason: "conflict", key: "public.storefront.refusal.conflict" },

  // ── identity_required: say who you are, then try again ────────────────
  no_contact: { reason: "identity_required", key: "public.storefront.refusal.identityRequired" },
  identity_required: { reason: "identity_required", key: "public.storefront.refusal.identityRequired" },
  nameRequired: { reason: "identity_required", key: "public.storefront.refusal.identityRequired" },
  attendee_names: { reason: "identity_required", key: "public.storefront.refusal.identityRequired" },
  delivery: { reason: "identity_required", key: "public.storefront.refusal.identityRequired" },
  entitlement: { reason: "identity_required", key: "public.storefront.refusal.identityRequired" },
  identity_unconfirmed: { reason: "identity_required", key: "public.storefront.refusal.identityRequired" },
  promo_needs_customer: { reason: "identity_required", key: "public.storefront.refusal.promoNeedsName" },
  account_required: { reason: "identity_required", key: "public.storefront.refusal.signInRequired" },
  needs_auth: { reason: "identity_required", key: "public.storefront.refusal.signInRequired" },
  not_authenticated: { reason: "identity_required", key: "public.storefront.refusal.signInRequired" },
  captcha_required: { reason: "identity_required", key: "public.storefront.refusal.captchaRequired" },
  captcha_failed: { reason: "identity_required", key: "public.storefront.refusal.captchaRequired" },
  [PG_CHECK_VIOLATION]: { reason: "identity_required", key: "public.storefront.refusal.identityRequired" },

  // ── refused: a no you cannot retry your way out of ────────────────────
  not_allowed: { reason: "refused", key: "public.storefront.refusal.notAllowed" },
  forbidden: { reason: "refused", key: "public.storefront.refusal.notAllowed" },
  over_limit: { reason: "refused", key: "public.storefront.refusal.notAllowed" },
  plan_lacks_capability: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  instant_book_not_enabled: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  inquiry_only: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  not_bookable_here: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  reservations_off: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  no_offering_configured: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  no_booking_hours: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  hours_unreadable: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  unclaimed_seller: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  no_fixed_rate: { reason: "refused", key: "public.storefront.refusal.notOfferedHere" },
  unknown_offering: { reason: "refused", key: "public.storefront.refusal.notForSale" },
  offering_not_published: { reason: "refused", key: "public.storefront.refusal.notForSale" },
  offering_not_priceable: { reason: "refused", key: "public.storefront.refusal.notForSale" },
  cross_tenant_line: { reason: "refused", key: "public.storefront.refusal.notForSale" },
  not_sellable: { reason: "refused", key: "public.storefront.refusal.notForSale" },
  item_unavailable: { reason: "refused", key: "public.storefront.refusal.notForSale" },
  variant_required: { reason: "refused", key: "public.storefront.refusal.optionRequired" },
  variant_not_on_offering: { reason: "refused", key: "public.storefront.refusal.optionRequired" },
  addon_not_on_offering: { reason: "refused", key: "public.storefront.refusal.optionRequired" },
  slot_required: { reason: "refused", key: "public.storefront.refusal.slotRequired" },
  pay_in_person_not_allowed: { reason: "refused", key: "public.storefront.refusal.paymentOption" },
  deposit_not_offered: { reason: "refused", key: "public.storefront.refusal.paymentOption" },
  invalid_payment_choice: { reason: "refused", key: "public.storefront.refusal.paymentOption" },
  pay_at_door_not_offered: { reason: "refused", key: "public.storefront.refusal.paymentOption" },
  pay_at_door_not_yet: { reason: "refused", key: "public.storefront.refusal.paymentOption" },
  invalid_units: { reason: "refused", key: "public.storefront.refusal.quantity" },
  quantity: { reason: "refused", key: "public.storefront.refusal.quantity" },
  below_min_per_order: { reason: "refused", key: "public.storefront.refusal.quantity" },
  above_max_per_order: { reason: "refused", key: "public.storefront.refusal.quantity" },
  amount_out_of_range: { reason: "refused", key: "public.storefront.refusal.quantity" },
  party_below_minimum: { reason: "refused", key: "public.storefront.refusal.partySize" },
  party_above_maximum: { reason: "refused", key: "public.storefront.refusal.partySize" },
  empty_order: { reason: "refused", key: "public.storefront.refusal.emptyOrder" },
  empty: { reason: "refused", key: "public.storefront.refusal.emptyOrder" },
  promo_unknown: { reason: "refused", key: "public.storefront.refusal.promoUnknown" },
  promo_not_started: { reason: "refused", key: "public.storefront.refusal.promoNotStarted" },
  promo_expired: { reason: "refused", key: "public.storefront.refusal.promoExpired" },
  promo_exhausted: { reason: "refused", key: "public.storefront.refusal.promoExhausted" },
  promo_customer_limit: { reason: "refused", key: "public.storefront.refusal.promoExhausted" },
  promo_not_applicable: { reason: "refused", key: "public.storefront.refusal.promoNotApplicable" },
  promo_unavailable: { reason: "refused", key: "public.storefront.refusal.unavailable" },
  promo_refused: { reason: "refused", key: "public.storefront.refusal.promoNotApplicable" },
  age_gate_unconfirmed: { reason: "refused", key: "public.storefront.refusal.ageGateUnconfirmed" },
  age_gate_below_minimum: { reason: "refused", key: "public.storefront.refusal.ageGateBelowMinimum" },
  rate_limited: { reason: "refused", key: "public.storefront.refusal.rateLimited" },
  too_many_attempts: { reason: "refused", key: "public.storefront.refusal.rateLimited" },
  alreadyWaiting: { reason: "refused", key: "public.storefront.refusal.alreadyWaiting" },
  seatsAvailable: { reason: "refused", key: "public.storefront.refusal.seatsAvailable" },
  already_accepted: { reason: "refused", key: "public.storefront.refusal.alreadyDone" },
  already_paid: { reason: "refused", key: "public.storefront.refusal.alreadyDone" },
  not_reschedulable: { reason: "refused", key: "public.storefront.refusal.notAllowed" },
  not_found: { reason: "refused", key: "public.storefront.refusal.notFound" },
  notFound: { reason: "refused", key: "public.storefront.refusal.notFound" },
  wrong_tenant: { reason: "refused", key: "public.storefront.refusal.notFound" },
  session_not_found: { reason: "refused", key: "public.storefront.refusal.notFound" },
  session_missing: { reason: "refused", key: "public.storefront.refusal.notFound" },
  not_draft: { reason: "refused", key: "public.storefront.refusal.notFound" },
  token_invalid: { reason: "refused", key: "public.storefront.refusal.notFound" },
  invalid: { reason: "refused", key: "public.storefront.refusal.invalid" },
  invalid_request: { reason: "refused", key: "public.storefront.refusal.invalid" },
  validation: { reason: "refused", key: "public.storefront.refusal.invalid" },
  validation_failed: { reason: "refused", key: "public.storefront.refusal.invalid" },
  disposable_email: { reason: "refused", key: "public.storefront.refusal.invalid" },
  channel_unavailable: { reason: "refused", key: "public.storefront.refusal.channelUnavailable" },
  unavailable: { reason: "refused", key: "public.storefront.refusal.unavailable" },
  capacity_unavailable: { reason: "refused", key: "public.storefront.refusal.unavailable" },
  engine_error: { reason: "refused", key: "public.storefront.refusal.unavailable" },
  db_unavailable: { reason: "refused", key: "public.storefront.refusal.unavailable" },
  tenant_unavailable: { reason: "refused", key: "public.storefront.refusal.unavailable" },
};

const UNKNOWN: Entry = { reason: "refused", key: "public.storefront.refusal.unavailable" };

/** Every engine code the mapper knows, for the coverage test. */
export const KNOWN_ENGINE_CODES: readonly string[] = Object.keys(TABLE);

/** What an engine hands back, in any of the shapes the engines actually use. */
export type EngineRefusalLike =
  | string
  | {
      reason?: string | null;
      refusalKey?: string | null;
      code?: string | null;
      /** Postgres error message, checked for a constraint name. */
      message?: string | null;
      details?: string | null;
      constraint?: string | null;
    }
  | null
  | undefined;

/**
 * The engine's word for what happened, or "unknown".
 *
 * A Postgres check violation (23514) is only an identity refusal when it names
 * one of the identity constraints; any other CHECK is a fault of ours.
 */
export function engineCode(input: EngineRefusalLike): string {
  if (typeof input === "string") return input.trim() || "unknown";
  if (!input || typeof input !== "object") return "unknown";
  if (input.code === PG_CHECK_VIOLATION) {
    const text = `${input.constraint ?? ""} ${input.message ?? ""} ${input.details ?? ""}`;
    return IDENTITY_CONSTRAINTS.some((c) => text.includes(c)) ? PG_CHECK_VIOLATION : "engine_error";
  }
  const word = input.reason ?? input.refusalKey ?? input.code;
  return typeof word === "string" && word.trim() ? word.trim() : "unknown";
}

/**
 * Map an engine refusal to the widget contract.
 *
 * `locale` is the page's content locale; anything that is not a shipped
 * catalogue falls back to the platform default and then English, per
 * `createTranslator`.
 */
export function mapEngineRefusal(input: EngineRefusalLike, locale: string): StorefrontRefusal {
  const code = engineCode(input);
  const entry = TABLE[code] ?? UNKNOWN;
  const t = createTranslator(locale === "es" ? "es" : locale || "en");
  return { ok: false, reason: entry.reason, code, message: t(entry.key) };
}

/** The bucket alone, for callers that decide before they speak. */
export function refusalReasonFor(input: EngineRefusalLike): StorefrontRefusalReason {
  return (TABLE[engineCode(input)] ?? UNKNOWN).reason;
}
