/**
 * refusal-reason.ts — the engine's refusal vocabulary, translated into the
 * counter's sentences.
 *
 * WHY THIS FILE EXISTS. The POS engine never throws: every refusal comes back
 * as `{ ok: false, reason: "<word>", error: "<English sentence>" }`. The
 * screen used to render `reason` verbatim, so a cashier at a till read
 * `not_draft`, `no_contact` and `engine_error` off the screen, in every
 * language. The `error` string beside it is English-only and written for a
 * log, not for a person standing in a queue. So the reason word — the part
 * that is a stable machine fact — is what the interface keys off, and the
 * sentence comes from the message catalogue in the request's own language.
 *
 * WHY THE MAPS ARE `Record<EngineReason, …>` AND NOT `Partial<…>`. A reason
 * the engine gains and this file has not is the exact defect this closes: it
 * would fall through to a default and show a cashier a sentence about the
 * wrong thing. Typed total, `tsc` refuses to build until the new reason is
 * given a sentence. The engine's unions arrive as TYPE imports only, so
 * nothing here pulls a `server-only` module into a client bundle.
 *
 * WHY THERE ARE THREE MAPS AND NOT ONE. `amount` means two different things.
 * On a collection it means "that allocation is more than what is still owed"
 * — someone else got there first. On a shift it means "opening cash must be
 * zero or more" — a typo in a box. One map would have to pick one of those
 * sentences and be wrong half the time, which is worse than no sentence at
 * all because it reads as an answer. The caller knows which command it just
 * ran, so the caller picks the map.
 */

import type { PosRefusalReason } from "@/components/admin/pos/pos-types";
import type { RecordVerifiedCollectionResult, StartCollectionResult } from "./collection";
import type { ReserveCollectionRefusal } from "./collection-reservations";
import type { CreateDraftOrderResult, MutateLineResult, RepriceResult } from "./draft";
import type { CloseShiftResult, OpenShiftResult } from "./shift";

type Refused<T> = Extract<T, { ok: false }>;

/**
 * Every reason any sale-side command can hand back.
 *
 * The reservation layer's own words (`not_open`, `already_collected`,
 * `exceeds_outstanding`) are in here even though `refuseClaim` folds them into
 * `startCollection`'s narrower set today. They are reasons the money path can
 * produce, `recordVerifiedCollection` already returns one of them straight
 * out, and a word that reaches a screen with no sentence behind it is the
 * whole defect this module closes — so the map covers them at the source
 * rather than trusting one caller's folding to stay in place.
 */
export type PosSaleRefusalReason =
  | Refused<StartCollectionResult>["reason"]
  | Refused<RecordVerifiedCollectionResult>["reason"]
  | ReserveCollectionRefusal
  | Refused<CreateDraftOrderResult>["reason"]
  | Refused<MutateLineResult>["reason"]
  | Refused<RepriceResult>["reason"];

/** Every reason either shift command can hand back. */
export type PosShiftRefusalReason =
  | Refused<OpenShiftResult>["reason"]
  | Refused<CloseShiftResult>["reason"];

/**
 * Refusals raised by the ROUTE's own action guard rather than by the engine:
 * the staff/capability check and the zod parse in `pos/actions.ts`, plus the
 * pickup-window check that lives there because it is a UI rule about a
 * datetime input, not a fact about an order.
 */
export type PosActionRefusalReason =
  | "not_allowed"
  | "unavailable"
  | "invalid"
  | "pickup_window";

export const SALE_REFUSALS: Readonly<Record<PosSaleRefusalReason, PosRefusalReason>> = {
  // Someone else already claimed part of this balance under the row lock, so
  // the number the till was looking at is no longer what is owed.
  amount: "balanceChanged",
  // `orders.version` moved under the operator: another device edited this sale.
  conflict: "saleReloading",
  // A line's offering refuses an anonymous buyer (a ticket, a delivery).
  no_contact: "needsCustomerName",
  // The provider answered and said no. Nothing was taken.
  engine_error: "paymentDeclined",
  // We could not reach the provider or the database, so the outcome of THIS
  // attempt is genuinely unknown. Never offer a fresh attempt on this one.
  unavailable: "paymentUnknown",
  // A held class place lapsed or was outbid between basket and charge.
  sold_out: "capacityGone",
  // The order left `draft`/`pending_payment` while this screen was open.
  not_draft: "bookingChanged",
  // The order is gone entirely — cancelled, or never existed.
  not_found: "bookingChanged",
  wrong_tenant: "wrongWorkspace",
  tendered: "tenderShort",
  empty: "emptySale",
  invalid: "itemRefused",
  promo_refused: "discountRefused",
  promo_needs_customer: "discountNeedsCustomer",
  terminal_unavailable: "readerUnavailable",
  // The reservation layer's own words. `not_open` and `already_collected` both
  // mean the sale moved on; `exceeds_outstanding` is the balance changing
  // under the till, which is the same sentence as `amount`.
  not_open: "bookingChanged",
  already_collected: "bookingChanged",
  exceeds_outstanding: "balanceChanged",
};

export const SHIFT_REFUSALS: Readonly<Record<PosShiftRefusalReason, PosRefusalReason>> = {
  already_open: "shiftAlreadyOpen",
  already_closed: "shiftAlreadyClosed",
  // A cash box amount that is not a whole number of minor units, or negative.
  // NOT `balanceChanged`: nobody collected anything, the box is just wrong.
  amount: "amountInvalid",
  version_conflict: "saleReloading",
  not_found: "bookingChanged",
  unavailable: "paymentUnknown",
};

export const ACTION_REFUSALS: Readonly<Record<PosActionRefusalReason, PosRefusalReason>> = {
  not_allowed: "notAllowed",
  unavailable: "paymentUnknown",
  invalid: "itemRefused",
  pickup_window: "pickupWindow",
};

function lookup<K extends string>(
  table: Readonly<Record<K, PosRefusalReason>>,
  raw: unknown,
  fallback: PosRefusalReason,
): PosRefusalReason {
  if (typeof raw !== "string") return fallback;
  const hit = (table as Readonly<Record<string, PosRefusalReason | undefined>>)[raw];
  return hit ?? fallback;
}

/**
 * A sale/collection refusal as a sentence key.
 *
 * The fallback is `paymentUnknown`, deliberately the most cautious sentence
 * in the vocabulary: an unrecognised reason means we do not know what
 * happened, and "check before trying again" is the only honest thing to say
 * about an outcome nobody can name. It also carries no retry action, so an
 * unknown state cannot be turned into a second charge by a tap. The maps
 * above are total over the engine's own unions, so this only fires on a
 * reason that reached the browser from somewhere else entirely.
 */
export function posSaleRefusal(raw: unknown): PosRefusalReason {
  return lookup(SALE_REFUSALS, raw, "paymentUnknown");
}

/**
 * A shift refusal as a sentence key. Falls back to `amountInvalid`: a shift
 * command moves no customer money, so the cautious sentence about an
 * unresolved payment would be a lie here. The worst honest guess is that the
 * cash box number was not accepted.
 */
export function posShiftRefusal(raw: unknown): PosRefusalReason {
  return lookup(SHIFT_REFUSALS, raw, "amountInvalid");
}

/** A route-guard refusal (capability, parse, pickup window) as a sentence key. */
export function posActionRefusal(raw: unknown): PosRefusalReason {
  return lookup(ACTION_REFUSALS, raw, "paymentUnknown");
}

/**
 * The one reader for a command result.
 *
 * Every POS action returns either `{ ok: true, … }` or `{ ok: false, reason,
 * … }`, and two of them (`staff()` in `pos/actions.ts`) return `{ ok: false,
 * error }` with no `reason` at all. `null` means "this succeeded"; anything
 * else is a sentence key the banner can render.
 */
export function refusalFromResult(
  result: { ok: boolean; reason?: unknown; error?: unknown },
  kind: "sale" | "shift" | "action",
): PosRefusalReason | null {
  if (result.ok) return null;
  const raw = result.reason ?? result.error;
  if (kind === "shift") return posShiftRefusal(raw);
  if (kind === "action") return posActionRefusal(raw);
  // A sale command that came back through the action guard rather than the
  // engine carries the guard's own words; try those before the cautious
  // fallback, so `not_allowed` reads as a permission refusal and not as an
  // unresolved payment.
  if (typeof raw === "string" && raw in ACTION_REFUSALS && !(raw in SALE_REFUSALS)) {
    return posActionRefusal(raw);
  }
  return posSaleRefusal(raw);
}
