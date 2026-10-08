/**
 * Pure display helpers for the held-payouts list (no server-only imports, so a
 * client component can use them). "500+" is locale-neutral.
 */

/** Row cap of the platform-wide list. Mirrors HELD_PAYOUTS_CAP in booking-payouts-ledger.ts (pinned by a test). */
export const HELD_PAYOUTS_DISPLAY_CAP = 500;

/** Count text: the exact number, or "500+" when the list hit its cap. */
export function heldCountLabel(count: number, capped: boolean): string {
  return capped ? `${HELD_PAYOUTS_DISPLAY_CAP}+` : String(count);
}
