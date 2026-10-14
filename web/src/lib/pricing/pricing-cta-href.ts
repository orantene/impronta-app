/**
 * pricing-cta-href.ts: the one place that turns a /pricing tier card + billing
 * interval into its CTA destination (TUL-828). Pure, so it is unit tested.
 *
 * Every CTA goes to the guided front door `/start`, carrying `plan` (the
 * checkout plan key) and `interval` (`month` | `year`). Prices are never built
 * here: this only builds links. The locale prefix is added by `MarketingCta`
 * (`withLocaleHref`), so hrefs here are un-prefixed.
 */
import { PLAN_KEYS } from "@/lib/access/plan-catalog";
import {
  DEFAULT_BILLING_INTERVAL,
  type BillingInterval,
} from "./interval-pricing";

export type PricingPackageSlug = "talent" | "workspace";

/** Catalog tier slug to checkout plan key. */
const TALENT_PLAN_KEYS: Readonly<Record<string, string>> = {
  free: "talent_basic",
  pro: "talent_pro",
  max: "talent_portfolio",
};

/** Parse the `?interval=` query value; anything unknown is the default. */
export function parseBillingInterval(
  value: string | null | undefined,
): BillingInterval {
  return value === "year" ? "year" : DEFAULT_BILLING_INTERVAL;
}

export function planKeyForTier(
  packageSlug: PricingPackageSlug,
  tierKey: string,
): string {
  if (packageSlug === "talent") {
    return TALENT_PLAN_KEYS[tierKey] ?? "talent_basic";
  }
  // Workspace plans use the bare catalog keys (plan-catalog.ts PLAN_KEYS);
  // the catalog slug `hub` is the "network" plan.
  const key = tierKey === "hub" ? "network" : tierKey;
  return (PLAN_KEYS as readonly string[]).includes(key) ? key : "free";
}

export function buildPricingCtaHref(input: {
  packageSlug: PricingPackageSlug;
  tierKey: string;
  interval: BillingInterval;
}): string {
  const q = new URLSearchParams({
    plan: planKeyForTier(input.packageSlug, input.tierKey),
    interval: input.interval,
  });
  return `/start?${q.toString()}`;
}
