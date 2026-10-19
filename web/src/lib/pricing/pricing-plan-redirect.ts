/**
 * pricing-plan-redirect.ts (BILL-B, TUL-829): what `/pricing?plan=&interval=`
 * does with a plan. /pricing is the marketing comparison page and never read
 * `plan`, so an in-app upgrade link that landed here lost the chosen plan and
 * the yearly toggle. A request carrying a valid paid plan is sent on to the
 * route that honours it; anything else renders the page as before (null).
 *
 * Routing only: no price, fee or checkout is built here. Pure, unit tested.
 *
 * - signed-in talent + paid talent plan: the app route `/talent/plan`, which
 *   starts checkout or opens the plan-change confirm;
 * - workspace admin + paid workspace plan: the account page, which auto-starts
 *   workspace checkout from the same query;
 * - everyone else: the `/start` front door, which carries the intent through
 *   sign-up (un-prefixed; the caller adds the locale prefix).
 */
import { parsePlanIntent, planIntentQuery, isTalentIntent, isWorkspaceIntent } from "@/lib/onboarding/plan-intent";
import type { PricingViewer } from "./pricing-cta-href";

export function pricingPlanRedirect(input: {
  plan: unknown;
  interval: unknown;
  viewer: PricingViewer;
}): string | null {
  const intent = parsePlanIntent(input.plan, input.interval);
  if (!intent) return null;
  const q = planIntentQuery(intent);
  const v = input.viewer;
  if (isTalentIntent(intent) && v.kind === "talent") {
    return `${v.appUrl}/talent/plan?${q}`;
  }
  if (isWorkspaceIntent(intent) && v.kind !== "anon" && v.adminWorkspaceSlug) {
    return `${v.appUrl}/${encodeURIComponent(v.adminWorkspaceSlug)}/admin/account?${q}`;
  }
  return `/start?${q}`;
}

/** True when the query carries a plan worth resolving the viewer for. */
export function pricingQueryHasPlan(plan: unknown, interval: unknown): boolean {
  return parsePlanIntent(plan, interval) !== null;
}
