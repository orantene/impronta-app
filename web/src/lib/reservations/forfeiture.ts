/**
 * forfeiture.ts — what a no-show costs, and who ends up with what.
 *
 * THE RULING THIS IMPLEMENTS (D2, closed):
 *   The TENANT keeps the forfeiture. The platform takes NO COMMISSION on a
 *   penalty. Normal commission applies only when a deposit lands on a real bill.
 *
 * THE MECHANISM IS NOT WHAT D2 ORIGINALLY SAID, and the difference matters.
 * D2 was reasoned from Direct Charges with `application_fee_amount` set to
 * zero. That charge model was deleted on 2026-09-01: our connected accounts are
 * `recipient`-agreement with capability {transfers} and cannot take a card, so
 * every charge lands on the PLATFORM account and money reaches a tenant by
 * `stripe.transfers.create`. There is no application fee to set to zero, and
 * nothing in this file writes one.
 *
 * WHICH CREATES A COST D2 COULD NOT HAVE ANTICIPATED. Because the charge lands
 * on us, Stripe's processing fee is sunk on the platform balance BEFORE any
 * transfer. Transfer the full amount and the platform pays roughly 2.9% + $0.30
 * per no-show — about $0.88 on a $20 deposit — forever, on the one flow whose
 * volume RISES when customers behave badly.
 *
 * RULED: THE TENANT NETS THE PROCESSING FEE. "We take zero" stays literally
 * true — zero COMMISSION — while the platform does not pay a card fee for
 * someone else's no-show. The receipt shows the processing line rather than
 * deducting it silently, because a venue that discovers a deduction is a venue
 * that thinks it was skimmed.
 *
 * PURE. No Stripe, no DB. The caller performs the charge and the transfer; this
 * decides the numbers, so they can be asserted without a card.
 */

/** Stripe's standard card pricing, in the only two numbers it has. */
export type ProcessingRate = {
  /** Basis points. 290 = 2.9%. */
  percentBps: number;
  /** Flat, in integer cents. */
  fixedCents: number;
};

export const DEFAULT_PROCESSING_RATE: ProcessingRate = { percentBps: 290, fixedCents: 30 };

export type ForfeitureSplit = {
  /** Charged to the guest's card, integer cents. */
  chargeCents: number;
  /** What Stripe keeps. Estimated from the rate; the webhook reconciles later. */
  processingFeeCents: number;
  /** Transferred to the tenant, integer cents. */
  transferCents: number;
  /** Always 0 on a penalty. Named so the number is visible, not implied. */
  commissionCents: number;
};

/**
 * Split a forfeiture.
 *
 * `commissionCents` is a field rather than an omission on purpose: a reader
 * asking "what did the platform take" should find a 0, not an absence they have
 * to interpret. An absent number and a zero are the same thing to a machine and
 * different things to a person deciding whether we are honest.
 */
export function splitForfeiture(
  amountCents: number,
  rate: ProcessingRate = DEFAULT_PROCESSING_RATE,
): ForfeitureSplit {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { chargeCents: 0, processingFeeCents: 0, transferCents: 0, commissionCents: 0 };
  }

  // Rounded UP: Stripe rounds its own fee up, and a platform that rounds down
  // pays the difference on every transaction forever.
  const processingFeeCents = Math.min(
    amountCents,
    Math.ceil((amountCents * rate.percentBps) / 10_000) + rate.fixedCents,
  );

  return {
    chargeCents: amountCents,
    processingFeeCents,
    // Never negative. A forfeiture smaller than the processing fee transfers
    // nothing rather than inventing a debt the tenant owes us — which is what
    // a bare subtraction would produce on a $0.20 fee.
    transferCents: Math.max(0, amountCents - processingFeeCents),
    commissionCents: 0,
  };
}

/**
 * Is this reservation a no-show, right now?
 *
 * Deliberately NOT "has nobody arrived". A party that has not arrived yet and a
 * party that never came look identical in `admitted_count`, and the grace period
 * is the only thing that tells them apart. That distinction is the whole reason
 * `no_show_at` is a stamp rather than something derived from a count.
 */
export function isNoShowNow(input: {
  startsAt: Date;
  admittedCount: number;
  graceMinutes: number;
  noShowAt: Date | null;
  now: Date;
}): boolean {
  if (input.noShowAt !== null) return false; // already marked; not marked twice
  if (input.admittedCount > 0) return false; // somebody came, even if not all
  const deadline = input.startsAt.getTime() + input.graceMinutes * 60_000;
  return input.now.getTime() > deadline;
}

/**
 * May this reservation still be cancelled without forfeiting?
 *
 * The boundary is inclusive of the guest: exactly on the deadline is still free.
 * A guest who cancels at the stated hour and is charged anyway will dispute it,
 * and they will be right.
 */
export function isWithinFreeCancellation(input: {
  startsAt: Date;
  freeCancelHours: number;
  now: Date;
}): boolean {
  const deadline = input.startsAt.getTime() - input.freeCancelHours * 3_600_000;
  return input.now.getTime() <= deadline;
}
