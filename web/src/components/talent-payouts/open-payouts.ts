/**
 * Single source of truth for "go to talent payout setup".
 *
 * The real payouts UI is the canonical standalone route
 * `/talent/settings/payouts` (branded embedded Stripe Connect onboarding).
 * The tenant-scoped `/{slug}/talent/settings/payouts` 308-redirects here,
 * so the platform-scoped path works from any talent context.
 *
 * A full navigation (not an SPA push) is intentional: the destination is a
 * canonical route that fully replaces the talent SPA, and a hard nav avoids
 * the SPA-overlay races that have bitten in-shell client navigation before.
 */
export const TALENT_PAYOUTS_PATH = "/talent/settings/payouts";

export function openTalentPayouts(): void {
  if (typeof window !== "undefined") {
    window.location.assign(TALENT_PAYOUTS_PATH);
  }
}
