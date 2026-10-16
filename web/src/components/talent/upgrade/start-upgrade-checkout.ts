/**
 * TUL-829 · THE checkout adapter for the in-app upgrade modal.
 *
 * TUL-830 swaps the body of `startUpgradeCheckout` for the real talent
 * checkout (session creation lives there, never here). Until then it sends
 * the talent to the pricing page with plan, interval and the paywall that
 * opened the modal, so the intent survives the hop.
 *
 * Every upgrade affordance in the talent dashboard must go through this one
 * function. No caller builds a checkout or pricing URL of its own.
 */

import type { PlanKey } from "@/lib/access/plan-catalog";

import { buildUpgradeCheckoutHref, type UpgradeInterval } from "./upgrade-modal-model";

export type StartUpgradeCheckoutInput = {
  planKey: PlanKey;
  interval: UpgradeInterval;
  from: string;
};

export function startUpgradeCheckout(input: StartUpgradeCheckoutInput): void {
  if (typeof window === "undefined") return;
  // A hard navigation: the builder route renders without the dashboard shell,
  // and the pricing page is a different layout tree either way.
  window.location.assign(buildUpgradeCheckoutHref(input));
}
