"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";

import type { Plan } from "./capability-catalog";
import { UpgradeModal } from "./upgrade-modal";
import { useUpgradeModal } from "./upgrade-context";
import { useAdminWorkspace } from "@/components/admin/workspace-context";
import { changeWorkspacePlan } from "@/lib/server-actions/admin-billing";
import { startWorkspaceUpgrade } from "@/app/(workspace)/[tenantSlug]/admin/account/stripe-billing-actions";
import { readPromoCodeFromUrl } from "@/lib/billing/promo-code-param";

/**
 * GlobalUpgradeModal — THE upgrade modal. One instance, mounted at the admin
 * shell, reached by every upgrade CTA in the product.
 *
 * Free downgrade  → changeWorkspacePlan (direct DB write, no Stripe)
 * Studio / Agency → startWorkspaceUpgrade → Stripe Checkout redirect
 * Network         → mailto: sales handoff (no self-serve price yet)
 *
 * There is deliberately no local "set the plan" path here. A second modal used
 * to have one (`shell/internal/drawers/UpgradeModal.tsx`): its CTA flipped a
 * `useState` plan value, toasted "upgrade applied", and charged nothing, so the
 * shell unlocked cards the server still refused until the next reload. It was
 * deleted; if you are adding a plan-changing branch, it goes through a server
 * action or it does not exist.
 */
export function GlobalUpgradeModal({
  tenantSlug,
  activePlan: activePlanOverride,
}: {
  /**
   * Workspace slug for the checkout session. Falls back to
   * {@link useAdminWorkspace}; the SPA shell has the slug as a prop and no
   * AdminWorkspaceProvider above it, so it passes the value in directly.
   */
  tenantSlug?: string;
  /** Live plan tier. Same fallback story as `tenantSlug`. */
  activePlan?: Plan;
} = {}) {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { open, reason, setOpen } = useUpgradeModal();
  const workspace = useAdminWorkspace();
  const [pending, startTransition] = React.useTransition();

  const activePlan: Plan = activePlanOverride ?? workspace?.plan ?? "free";
  const slug = tenantSlug ?? workspace?.slug;

  function handleSelect(plan: Plan) {
    if (pending) return;

    if (
      plan === "website" ||
      plan === "studio" ||
      plan === "agency" ||
      plan === "network"
    ) {
      if (!slug) {
        toast.error("Couldn't identify workspace.");
        return;
      }
      startTransition(async () => {
        const result = await startWorkspaceUpgrade(plan, slug, readPromoCodeFromUrl());
        if (result.ok) {
          window.location.href = result.redirectUrl;
        } else if (result.noStripe) {
          // Network has no self-serve price configured — hand off to sales.
          // Address matches the product domain (Tulala) so replies route to
          // the same inbox the user is corresponding with from /get-started.
          window.open("mailto:hello@tulala.digital?subject=Network%20setup", "_blank");
          setOpen(false);
        } else {
          toast.error(result.error);
        }
      });
      return;
    }

    // Free downgrade — no Stripe subscription needed
    startTransition(async () => {
      const result = await changeWorkspacePlan(plan);
      if (result.ok) {
        toast.success(`Workspace plan set to ${plan}.`);
        queueRouterRefresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <UpgradeModal
      open={open}
      onOpenChange={setOpen}
      activePlan={activePlan}
      onSelect={handleSelect}
      reason={reason}
    />
  );
}
