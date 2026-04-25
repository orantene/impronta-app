"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Plan } from "./capability-catalog";
import { UpgradeModal } from "./upgrade-modal";
import { useUpgradeModal } from "./upgrade-context";
import { useAdminWorkspace } from "@/components/admin/workspace-context";
import { changeWorkspacePlan } from "@/app/(dashboard)/admin/account/billing-actions";

/**
 * GlobalUpgradeModal — single modal instance mounted at the admin shell.
 *
 * Reads the active plan from {@link useAdminWorkspace} (the live
 * `agencies.plan_tier` row) and writes plan changes back through the
 * `changeWorkspacePlan` server action. After a successful update the
 * router refresh re-renders the layout so the tier-chip + capability
 * gates pick up the new tier without a full reload.
 *
 * Pre-Stripe scaffold: every tier change goes through the same DB write.
 * When real billing lands, paid upgrades will route to Stripe Checkout
 * before this action; the action itself stays as the single source of
 * truth for "this tenant is on tier X."
 */
export function GlobalUpgradeModal() {
  const router = useRouter();
  const { open, setOpen } = useUpgradeModal();
  const workspace = useAdminWorkspace();
  const [pending, startTransition] = React.useTransition();

  const activePlan: Plan = workspace?.plan ?? "free";

  function handleSelect(plan: Plan) {
    if (pending) return;
    startTransition(async () => {
      const result = await changeWorkspacePlan(plan);
      if (result.ok) {
        toast.success(`Workspace plan set to ${plan}.`);
        router.refresh();
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
