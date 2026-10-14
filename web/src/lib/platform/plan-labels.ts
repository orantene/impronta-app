/**
 * English plan names for server-composed platform text (Stripe health lines).
 * Component code reads the same names from `dashboard.platform.tier.*`; the
 * test keeps the two, and PLAN_CATALOG, from drifting apart again.
 */
export const PLAN_NAME_EN: Record<string, string> = {
  free: "Free",
  website: "Website",
  studio: "Studio",
  agency: "Agency",
  hub: "Network",
  network: "Network",
  legacy: "Legacy",
  pro: "Pro",
  max: "Web Office",
};

export function planNameEn(slug: string): string {
  return PLAN_NAME_EN[slug] ?? slug;
}
