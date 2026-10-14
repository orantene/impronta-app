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

/**
 * Who is looking at /pricing (TUL-828). `appUrl` is the absolute app-host
 * origin. Only what the href decision needs: no email, no ids.
 */
export type PricingViewer =
  | { kind: "anon" }
  | { kind: "talent"; appUrl: string; adminWorkspaceSlug: string | null }
  | { kind: "workspace"; appUrl: string; adminWorkspaceSlug: string };

const PAID_TALENT = new Set(["talent_pro", "talent_portfolio"]);

export function buildPricingCtaHref(input: {
  packageSlug: PricingPackageSlug;
  tierKey: string;
  interval: BillingInterval;
  viewer?: PricingViewer;
}): string {
  const plan = planKeyForTier(input.packageSlug, input.tierKey);
  const q = new URLSearchParams({ plan, interval: input.interval });
  const v = input.viewer;
  if (v && v.kind !== "anon") {
    // Signed-in talent, paid talent plan: the slug-less app route resolves
    // their workspace and auto-starts checkout (no /start detour).
    if (input.packageSlug === "talent" && v.kind === "talent" && PAID_TALENT.has(plan)) {
      return `${v.appUrl}/talent/plan?${q.toString()}`;
    }
    // Workspace admin, paid workspace plan: the account page auto-starts
    // workspace checkout from ?plan=&interval= (WorkspaceCheckoutAutoStart).
    if (
      input.packageSlug === "workspace" &&
      v.adminWorkspaceSlug &&
      plan !== "free"
    ) {
      return `${v.appUrl}/${encodeURIComponent(v.adminWorkspaceSlug)}/admin/account?${q.toString()}`;
    }
  }
  return `/start?${q.toString()}`;
}
