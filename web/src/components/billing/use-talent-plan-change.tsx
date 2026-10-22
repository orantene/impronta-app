"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TalentPlanChangeModal } from "@/components/billing/talent-plan-change-modal";
import type { PlanChangeTarget } from "@/lib/billing/duplicate-subscription";

/**
 * TUL-831 / TUL-833 · state + modal for the upgrade surfaces. `startTalentUpgrade`
 * answers an existing subscriber with a `planChange` target; the surface calls
 * `open(target)` and renders `modal` instead of sending the customer to the
 * Stripe portal. `code` is whatever promo the surface already collected.
 */
export function useTalentPlanChange(tenantSlug: string | null, code: string | null, onChanged?: () => void): {
  open: (target: PlanChangeTarget) => void;
  modal: ReactNode;
} {
  const [target, setTarget] = useState<PlanChangeTarget | null>(null);
  const router = useRouter();
  const close = () => setTarget(null);
  return {
    open: setTarget,
    modal:
      target && tenantSlug ? (
        <TalentPlanChangeModal
          tenantSlug={tenantSlug}
          target={target}
          initialCode={code}
          onDone={() => {
            close();
            router.refresh();
            onChanged?.();
          }}
          onCancel={close}
        />
      ) : null,
  };
}
