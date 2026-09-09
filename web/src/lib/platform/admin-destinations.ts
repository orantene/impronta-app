/**
 * Platform administration destinations and template-designer scope (N06).
 */

export const PLATFORM_DESTINATIONS = [
  "accounts",
  "plans_capabilities",
  "business_registry",
  "templates_labels",
  "integrations",
  "operations",
  "audit",
] as const;

export type PlatformDestination = (typeof PLATFORM_DESTINATIONS)[number];

export function templateDesignerMayTouchMoney(role: "template_designer" | "financial_operator"): boolean {
  return role === "financial_operator";
}

export type AnalyticsDenominator =
  | { metric: "utilization"; from: "commitments_and_visits" }
  | { metric: "revenue"; from: "defined_money_records" };

/** No parent/component double-count: revenue reads leaf money rows only. */
export function revenueCentsWithoutDoubleCount(input: {
  parentOrderCents: number;
  componentLineCents: readonly number[];
  countParent: boolean;
}): number {
  if (input.countParent) return input.parentOrderCents;
  return input.componentLineCents.reduce((s, n) => s + n, 0);
}
