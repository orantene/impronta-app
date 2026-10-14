/**
 * TUL-707: the platform footer's "Showing prices in USD" chip is a lie on a
 * talent profile priced in MXN. The profile's own currency is the first priced
 * offering's, or null when nothing is priced (the footer then keeps its picker).
 */
export function profilePriceCurrency(
  offerings: ReadonlyArray<{ currency?: string | null; amountCents?: number | null }>,
): string | null {
  for (const o of offerings) {
    const code = o.currency?.trim().toUpperCase();
    if (code && /^[A-Z]{3}$/.test(code) && (o.amountCents ?? 0) > 0) return code;
  }
  return null;
}
