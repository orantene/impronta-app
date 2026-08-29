"use client";

/**
 * upgrade-bridge.ts — everything the shell is allowed to do about plan tier.
 *
 * THE INCIDENT THIS FILE IS THE ANSWER TO
 * ───────────────────────────────────────
 * Two upgrade modals were mounted in the workspace admin. The real one
 * (`site-control-center/global-upgrade-modal.tsx`, Stripe Checkout) was mounted
 * only inside `shell/admin-shell.tsx`, which nothing imports, so it never
 * rendered. The one users saw was `shell/internal/drawers/UpgradeModal.tsx`,
 * and its primary CTA was:
 *
 *     setPlan(requiredPlan);
 *     toast("Welcome to {plan} · upgrade applied");
 *
 * `setPlan` was a `useState` setter on the shell context. Nothing reached the
 * database and nothing was charged: the shell re-rendered as though the tenant
 * were on Agency — locked cards opened, roster caps moved — while
 * `agencies.plan_tier` stayed `free` and every server-side gate went on
 * refusing. One reload and it all vanished.
 *
 * Both halves of the fix live here, so the two things a reader keeps confusing
 * sit side by side and are named for what they are:
 *
 *   • `useOpenUpgradeModal` — the ONLY way to ask for an upgrade. Hands the
 *     prompt's framing to `UpgradeModalProvider`, which drives the real,
 *     Stripe-backed modal.
 *   • `useDevPlanOverride` — the prototype's local tier flip, for design QA on
 *     a standalone demo. A hard no-op for any real bridged tenant.
 *
 * `upgrade-flow-wiring.static.test.ts` asserts both, plus the provider ancestry
 * that makes the first one work.
 */

import { useCallback } from "react";

import { useUpgradeModal } from "@/components/admin/site-control-center/upgrade-context";

import type { UpgradeOffer } from "./drawer-ids";
import type { Plan } from "./types";

/** Only the shape these hooks read — the full bridge type is much larger. */
type BridgeIdentityCarrier = { tenantIdentity?: unknown } | null | undefined;

/**
 * True only in standalone prototype/demo mode. A bridged `tenantIdentity` means
 * a real workspace is on screen, and a real workspace's tier is a billing fact.
 *
 * Deliberately NOT openable by `?dev=1`: the control bar's visibility toggle is
 * a convenience, but a live tenant's tier must not move on a URL parameter.
 */
export function devPlanOverrideAllowed(bridge: BridgeIdentityCarrier): boolean {
  return !bridge?.tenantIdentity;
}

/**
 * Wrap the shell's local plan setter so it cannot fire on a real workspace.
 * Exposed on the shell context as `devSetPlan`, never as `setPlan`: the name is
 * half the guard, and a plan setter that looked like a plan setter is exactly
 * how the fake "upgrade applied" CTA shipped.
 */
export function useDevPlanOverride(
  bridge: BridgeIdentityCarrier,
  setPlan: (p: Plan) => void,
): (p: Plan) => void {
  const allowed = devPlanOverrideAllowed(bridge);
  return useCallback(
    (p: Plan) => {
      if (!allowed) return;
      setPlan(p);
    },
    [allowed, setPlan],
  );
}

/**
 * The shell's `openUpgrade(offer)`. Every contextual prompt in the product goes
 * through it: locked overview cards, the settings rows for custom domain /
 * brand identity / logo watermark / media gallery / team roles, the domain
 * manager, the media page, and the Free activation banner.
 *
 * `feature`, `why`/`outcome` and `requiredPlan` are forwarded so the modal can
 * say "Custom domain needs Agency" instead of opening a bare plan picker. The
 * remaining `UpgradeOffer` fields were framing for the deleted prototype
 * modal's caller-supplied bullet list; the real modal renders each tier's
 * actual feature list, so it does not need them.
 *
 * Requires an `UpgradeModalProvider` ancestor. Without one `useUpgradeModal`
 * returns inert setters and every upgrade CTA in the product goes quietly dead
 * — which is the failure this whole file exists because of.
 */
export function useOpenUpgradeModal(): (
  offer: Omit<UpgradeOffer, "open">,
) => void {
  const { openUpgrade: openRealUpgradeModal } = useUpgradeModal();
  return useCallback(
    (offer: Omit<UpgradeOffer, "open">) => {
      openRealUpgradeModal({
        requiredPlan: offer.requiredPlan,
        feature: offer.feature,
        why: offer.outcome ?? offer.why,
      });
    },
    [openRealUpgradeModal],
  );
}
