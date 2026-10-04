/**
 * `agency_bookings.total_client_revenue` (and matching `booking_talent.client_charge_total`)
 * are NUMERIC major units (e.g. 950.00 MXN), not integer cents.
 *
 * Agenda historically treated the column as cents, so a MXN $950 booking
 * rendered as $9.50 and pay-link mint used the wrong amount. One helper —
 * every reader converts here.
 */

/**
 * Major-unit money → integer minor units (cents / centavos).
 * Null/empty/non-finite → 0. Never negative.
 */
export function majorMoneyToCents(raw: number | string | null | undefined): number {
  if (raw == null || raw === "") return 0;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

/** Alias — prefer this name at `total_client_revenue` call sites. */
export function totalClientRevenueToCents(
  raw: number | string | null | undefined,
): number {
  return majorMoneyToCents(raw);
}

/** Integer cents → major units for writers that persist `total_client_revenue`. */
export function centsToTotalClientRevenue(cents: number): number {
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return Math.round(cents) / 100;
}
