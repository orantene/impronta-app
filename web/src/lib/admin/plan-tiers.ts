/**
 * Plan tier catalog — single source of truth for tier dot color, display
 * label, and renew/billing summary line used across the admin shell.
 *
 * Three places used to maintain their own copies of these maps (top-bar tier
 * chip, account drawer plan body, account-shell hero stat). Now they all
 * import from here so a price or color change is a one-line edit.
 *
 * Note: `PLAN_LABEL` and `PLAN_COLOR` already live in
 * `components/admin/site-control-center/capability-catalog.ts` for the
 * marketing-leaning Site control center. The values match. We deliberately
 * keep two definitions: this one is keyed by `string` (tolerant of unknown
 * tenant rows), the catalog one is keyed by the strict `Plan` union.
 *
 * Phase 2 update (L50): `TIER_RENEW` is now a FALLBACK only. The live
 * renew copy comes from `loadTierRenewLabels(currency)` which reads the
 * monthly price from `product_prices`. Admin components that show the
 * renew line in a server context should call `loadTierRenewLabels` and
 * pass the result; client-side / static contexts continue to read this
 * constant. The fallback string here represents the original USD launch
 * pricing so the UI never shows an empty line.
 */

export const TIER_DOT: Record<string, string> = {
  free: "#a1a1aa",
  studio: "#3a7bff",
  agency: "#c9a227",
  network: "#146b3a",
};

export const TIER_LABEL: Record<string, string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

/**
 * English fallback copy. Kept for non-UI consumers (server logs, tests, and
 * `resolveTier`'s string contract). UI surfaces MUST render
 * `t(TIER_RENEW_KEY[plan])` so the line follows the dashboard locale —
 * otherwise a Spanish drawer shows an English renew line.
 */
export const TIER_RENEW: Record<string, string> = {
  free: "No renewal. Free plan.",
  studio: "$49 / month.",
  agency: "$149 / month.",
  network: "Custom contract · contact billing.",
};

/** Catalog keys mirroring {@link TIER_RENEW}, one per plan slug. */
export const TIER_RENEW_KEY: Record<string, string> = {
  free: "dashboard.adminShared.planRenew.free",
  studio: "dashboard.adminShared.planRenew.studio",
  agency: "dashboard.adminShared.planRenew.agency",
  network: "dashboard.adminShared.planRenew.network",
};

/** Resolve label / color / renew copy for an unknown plan key, falling back
 *  to free. Use this in components that read `workspace.plan` directly.
 *
 *  The optional `liveRenew` override lets server components inject the
 *  catalog-resolved renew line (from `loadTierRenewLabels`) without
 *  re-deriving the fallback shape. */
export function resolveTier(
  planKey: string | null | undefined,
  liveRenew?: Record<string, string>,
): {
  key: string;
  label: string;
  dot: string;
  renew: string;
} {
  const k = planKey ?? "free";
  const renewMap = liveRenew ?? TIER_RENEW;
  return {
    key: k,
    label: TIER_LABEL[k] ?? TIER_LABEL.free!,
    dot: TIER_DOT[k] ?? TIER_DOT.free!,
    renew: renewMap[k] ?? TIER_RENEW[k] ?? TIER_RENEW.free!,
  };
}
