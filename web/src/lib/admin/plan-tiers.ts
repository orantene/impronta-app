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

export const TIER_RENEW: Record<string, string> = {
  free: "No renewal — Free plan.",
  studio: "$49 / month.",
  agency: "$149 / month.",
  network: "Custom contract · contact billing.",
};

/** Resolve label / color / renew copy for an unknown plan key, falling back
 *  to free. Use this in components that read `workspace.plan` directly. */
export function resolveTier(planKey: string | null | undefined): {
  key: string;
  label: string;
  dot: string;
  renew: string;
} {
  const k = planKey ?? "free";
  return {
    key: k,
    label: TIER_LABEL[k] ?? TIER_LABEL.free!,
    dot: TIER_DOT[k] ?? TIER_DOT.free!,
    renew: TIER_RENEW[k] ?? TIER_RENEW.free!,
  };
}
