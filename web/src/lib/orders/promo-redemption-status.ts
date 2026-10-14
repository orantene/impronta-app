/**
 * What a `tenant_promo_redemptions` row means, by status (TUL-940).
 *
 * `confirmed` is a use. `held` reserves a slot against a limit but is not yet a
 * use. `released`, `voided` and `no_show` are neither. Limits count
 * `LIMIT_STATUSES`; reports ("how many people used it") count `USE_STATUSES`.
 * The redeem function (`redeem_tenant_promo`) counts the same set under its lock.
 */
export const PROMO_REDEMPTION_STATUSES = [
  "held",
  "confirmed",
  "released",
  "voided",
  "no_show",
] as const;
export type PromoRedemptionStatus = (typeof PROMO_REDEMPTION_STATUSES)[number];

/** Rows that occupy a slot when a limit is checked. */
export const LIMIT_STATUSES: readonly PromoRedemptionStatus[] = ["confirmed", "held"];
/** Rows that are a real use, for counts shown to people. */
export const USE_STATUSES: readonly PromoRedemptionStatus[] = ["confirmed"];

export function countsTowardLimit(status: string): boolean {
  return (LIMIT_STATUSES as readonly string[]).includes(status);
}

export function isConfirmedUse(status: string): boolean {
  return (USE_STATUSES as readonly string[]).includes(status);
}

/** The update a full refund applies. The row is kept for the audit trail. */
export function voidRedemptionPatch(now: Date = new Date()): {
  status: "voided";
  voided_at: string;
} {
  return { status: "voided", voided_at: now.toISOString() };
}
