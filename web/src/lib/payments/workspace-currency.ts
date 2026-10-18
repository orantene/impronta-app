/**
 * The currency a workspace's money tiles show when there is nothing to read it from yet (no takings today,
 * nothing owed). DISPLAY ONLY: it never converts or recomputes an amount. The Overview board and the
 * Payments board must agree on it (TUL-734: Overview read "$0 MXN" while Payments read "$0 USD" for the same
 * Mexico studio, because Payments fell back to a hard-coded USD).
 *
 * Rule, same as the Overview: the agency's `preferred_currency`, else the first catalogue offering's currency,
 * else USD (the platform's primary currency). A value that is not a 3-letter code is ignored.
 */
const CODE = /^[A-Za-z]{3}$/;

export function pickWorkspaceCurrency(
  preferredCurrency: string | null | undefined,
  firstOfferingCurrency: string | null | undefined,
): string {
  for (const raw of [preferredCurrency, firstOfferingCurrency]) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (CODE.test(v)) return v.toUpperCase();
  }
  return "USD";
}
