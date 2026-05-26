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
import type { WorkspacePlanKey } from "@/lib/stripe/price-ids";

/**
 * GlobalUpgradeModal — single modal instance mounted at the admin shell.
 *
 * Free downgrade  → changeWorkspacePlan (direct DB write, no Stripe)
 * Studio / Agency → startWorkspaceUpgrade → Stripe Checkout redirect
 * Network         → mailto: sales handoff (no self-serve price yet)
 */
export function GlobalUpgradeModal() {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { open, setOpen } = useUpgradeModal();
  const workspace = useAdminWorkspace();
  const [pending, startTransition] = React.useTransition();

  const activePlan: Plan = workspace?.plan ?? "free";

  function handleSelect(plan: Plan) {
    if (pending) return;

    if (plan === "studio" || plan === "agency" || plan === "network") {
      const slug = workspace?.slug;
      if (!slug) {
        toast.error("Couldn't identify workspace.");
        return;
      }
      startTransition(async () => {
        const result = await startWorkspaceUpgrade(plan as WorkspacePlanKey, slug);
        if (result.ok) {
          window.location.href = result.redirectUrl;
        } else if (result.noStripe) {
          // Network has no self-serve price configured — hand off to sales.
          window.open("mailto:hello@impronta.group?subject=Network%20setup", "_blank");
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
    />
  );
}
