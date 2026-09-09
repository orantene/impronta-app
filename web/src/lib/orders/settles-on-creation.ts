/**
 * Is this order finished the moment it is created?
 *
 * NOTHING COLLECTED IS NOT NOTHING OWED, and `createPurchase` asked only the
 * first question: `payInPerson || collectCents > 0` meant "somebody will hand
 * over money later", and any yes left the order in `pending_payment` behind a
 * payment-length capacity hold.
 *
 * That is right for a $20 ticket paid at the door. The money is real, it is
 * just not here yet, and the hold is what stops the seat selling twice while
 * the buyer walks over.
 *
 * It is wrong for a free table reservation, and the cost is not cosmetic. The
 * guest books, reads "You are booked — nothing to pay", and gets an order
 * owing $0 with `hold_expires_at = now + 15 minutes`. Fifteen minutes later
 * `decideOrderExpiry` sees a lapsed hold on a `pending_payment` order and
 * CANCELS it, and `reap_capacity_allocations` releases the table. The table
 * actually stops being held before either of those runs, because `remaining()`
 * counts a hold only `WHERE expires_at > now()` — so the restaurant can
 * double-book it while the guest holds a confirmation and an admission that
 * both still say yes.
 *
 * So the question pay-in-person answers is not "who pays later" but "IS
 * ANYTHING OWED AT ALL". An order for nothing is complete on arrival.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHANGE. An order that is not pay-in-person
 * and collects nothing settled before this function existed — that is how a
 * `reserve_mode: 'free'` offering with a real price becomes `paid` at booking,
 * because the owner chose to take no money at booking time. Whether THAT is
 * right is a separate argument (it is the `free_reserve_expires_days` design,
 * and it is not this defect). This function only ever widens `paid`, so no
 * order that settled before stops settling now.
 */

export type CreationSettlementInput = {
  /** The buyer chose to settle in person, and every line allows it. */
  readonly payInPerson: boolean;
  /** What the payment leg charges now. Zero for free, free-reserve and door orders. */
  readonly collectCents: number;
  /** What the whole order costs, after discount. Zero when nothing is owed at all. */
  readonly totalCents: number;
};

/**
 * True when the order is finished as soon as it exists.
 *
 * A `true` carries two consequences at the call site, and they belong
 * together: the order becomes `paid` with no `hold_expires_at`, AND the
 * capacity it holds is committed. The first without the second is the shape of
 * the bug this replaces — a settled order whose table quietly lapses.
 */
export function settlesOnCreation(input: CreationSettlementInput): boolean {
  // Something is being charged right now, so a payment is genuinely in flight.
  if (!Number.isFinite(input.collectCents) || input.collectCents > 0) return false;
  // Unchanged: nothing to collect and nobody promising to pay in person.
  if (!input.payInPerson) return true;
  // Pay-in-person defers a real amount. With nothing owed there is nothing to
  // defer, and the deferral is what cancels the reservation. A non-finite or
  // negative total is not "nothing owed" — it is a number we do not trust, and
  // settling on it would close an order the money lanes never agreed to.
  return Number.isFinite(input.totalCents) && input.totalCents === 0;
}
