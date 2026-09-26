/**
 * Continue→Offer shared-draft seeding gate.
 *
 * `createOffer` auto-seeds $0 talent placeholders (S0.15). Those must not
 * block copying priced lines from the conversation's messages draft order —
 * otherwise Send refuses empty_offer → unavailable.
 */

export function offerDraftNeedsSharedSeed(lines: readonly { unitPriceCents: number }[]): boolean {
  return lines.length === 0 || lines.every((l) => Number(l.unitPriceCents ?? 0) <= 0);
}
