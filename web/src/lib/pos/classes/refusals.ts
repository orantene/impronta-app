/**
 * refusals.ts — every word the Classes mode's own commands can refuse with,
 * mapped to the catalogue leaf that says it.
 *
 * PURE. No catalogue import, no React: a KEY comes out, and the route's copy
 * builder (`classes-copy.ts`) turns keys into sentences in the request's
 * language. Same contract as `lib/pos/refusal-reason.ts` for the Counter.
 *
 * THE MAPS ARE TOTAL (`Record<Reason, Key>`), NEVER PARTIAL. A reason the
 * engine gains and this file has not is a compile error, not a sentence
 * about the wrong thing on a tablet at a front desk.
 *
 * WHAT IS NOT HERE, ON PURPOSE. The reschedule and the waitlist promote are
 * the Appointments page's own proven actions and keep their own sentences
 * (`dashboard.adminAppointments.reschedule.refusal.*`,
 * `dashboard.adminAppointments.waitlist.refusal.*`); the seat walk-in and
 * every cash collection go through the Counter's engine and its
 * `refusalFromResult`. This file covers the four things only this mode does:
 * check a booking in, mark attendance, list free times, book a walk-in.
 */

import type { PurchaseRefusalReason } from "@/lib/orders/purchase-types";
import type { NoSlotsReason } from "@/lib/scheduling/public-slots";

import type { CheckInRefusalReason } from "./checkin";
import type { WalkInBookingRefusal, WalkInSlotsResult } from "./walkin";

/** The leaves under `dashboard.pos.classes.refusal`. */
export type ClassesRefusalKey =
  | "notAllowed"
  | "invalid"
  | "unavailable"
  | "bookingNotFound"
  | "bookingChanged"
  | "alreadyCheckedIn"
  | "bookingCancelled"
  | "bookingCompleted"
  | "bookingNotCheckinable"
  | "placeGone"
  | "attendanceAlreadyMarked"
  | "placeNotValid"
  | "serviceNotFound"
  | "noBookingHours"
  | "hoursUnreadable"
  | "closedToday"
  | "fullyBookedToday"
  | "nameRequired"
  | "timeTaken"
  | "roomFull"
  | "mustPayOnline"
  | "needsAccount"
  | "needsContact"
  | "notForSale"
  | "couldNotBook";

export type ClassesRefusal = { readonly key: ClassesRefusalKey };

/** The route guard's own three words (staff check, zod parse, no client). */
export type ClassesActionRefusalReason = "not_allowed" | "invalid" | "unavailable";

export const ACTION_REFUSALS: Readonly<Record<ClassesActionRefusalReason, ClassesRefusalKey>> = {
  not_allowed: "notAllowed",
  invalid: "invalid",
  unavailable: "unavailable",
};

export const CHECKIN_REFUSALS: Readonly<Record<CheckInRefusalReason, ClassesRefusalKey>> = {
  not_found: "bookingNotFound",
  changed_since_opened: "bookingChanged",
  already_in: "alreadyCheckedIn",
  cancelled: "bookingCancelled",
  completed: "bookingCompleted",
  not_checkinable: "bookingNotCheckinable",
  unavailable: "unavailable",
};

export type AttendanceRefusalReason = "not_found" | "unavailable" | "invalid" | "already_marked" | "not_valid";

export const ATTENDANCE_REFUSALS: Readonly<Record<AttendanceRefusalReason, ClassesRefusalKey>> = {
  not_found: "placeGone",
  unavailable: "unavailable",
  invalid: "invalid",
  already_marked: "attendanceAlreadyMarked",
  not_valid: "placeNotValid",
};

type SlotsReadRefusal = Extract<WalkInSlotsResult, { ok: false }>["reason"];

export const SLOTS_REFUSALS: Readonly<Record<SlotsReadRefusal, ClassesRefusalKey>> = {
  not_found: "serviceNotFound",
  no_booking_hours: "noBookingHours",
  hours_unreadable: "hoursUnreadable",
  unavailable: "unavailable",
};

/** Why an otherwise readable day has no free time on it. */
export const NO_SLOTS_REFUSALS: Readonly<Record<NoSlotsReason, ClassesRefusalKey>> = {
  no_booking_hours: "noBookingHours",
  closed_in_window: "closedToday",
  fully_booked: "fullyBookedToday",
};

const PURCHASE_REFUSALS: Readonly<Record<PurchaseRefusalReason, ClassesRefusalKey>> = {
  empty_order: "couldNotBook",
  unknown_offering: "serviceNotFound",
  offering_not_published: "notForSale",
  cross_tenant_line: "serviceNotFound",
  account_required: "needsAccount",
  pay_in_person_not_allowed: "mustPayOnline",
  deposit_not_offered: "couldNotBook",
  invalid_units: "invalid",
  invalid_payment_choice: "couldNotBook",
  offering_not_priceable: "notForSale",
  variant_not_on_offering: "invalid",
  variant_required: "invalid",
  below_min_per_order: "invalid",
  above_max_per_order: "invalid",
  addon_not_on_offering: "invalid",
  amount_out_of_range: "invalid",
  no_contact: "needsContact",
  // The room (or the service's own stock) is taken at that time; the
  // person's calendar is `slot_taken`, a different sentence.
  sold_out: "roomFull",
  capacity_unavailable: "unavailable",
  slot_taken: "timeTaken",
  slot_required: "invalid",
  session_already_ended: "couldNotBook",
  // A walk-in from the till types no code; any promo word is a caller bug.
  promo_unknown: "couldNotBook",
  promo_not_started: "couldNotBook",
  promo_expired: "couldNotBook",
  promo_exhausted: "couldNotBook",
  promo_customer_limit: "couldNotBook",
  promo_not_applicable: "couldNotBook",
  promo_unavailable: "unavailable",
  unclaimed_seller: "notForSale",
  age_gate_unconfirmed: "couldNotBook",
  age_gate_below_minimum: "couldNotBook",
  engine_error: "couldNotBook",
};

export const WALKIN_REFUSALS: Readonly<Record<WalkInBookingRefusal, ClassesRefusalKey>> = {
  ...PURCHASE_REFUSALS,
  invalid: "nameRequired",
  not_found: "serviceNotFound",
};

function lookup<K extends string>(
  table: Readonly<Record<K, ClassesRefusalKey>>,
  raw: unknown,
): ClassesRefusalKey {
  if (typeof raw !== "string") return "unavailable";
  const hit = Object.entries<ClassesRefusalKey>(table).find(([reason]) => reason === raw);
  return hit ? hit[1] : "unavailable";
}

export function checkInRefusalKey(raw: unknown): ClassesRefusalKey {
  return lookup(CHECKIN_REFUSALS, raw);
}
export function attendanceRefusalKey(raw: unknown): ClassesRefusalKey {
  return lookup(ATTENDANCE_REFUSALS, raw);
}
export function slotsRefusalKey(raw: unknown): ClassesRefusalKey {
  return lookup(SLOTS_REFUSALS, raw);
}
export function noSlotsKey(raw: unknown): ClassesRefusalKey {
  return lookup(NO_SLOTS_REFUSALS, raw);
}
export function walkInRefusalKey(raw: unknown): ClassesRefusalKey {
  return lookup(WALKIN_REFUSALS, raw);
}
export function actionRefusalKey(raw: unknown): ClassesRefusalKey {
  return lookup(ACTION_REFUSALS, raw);
}
