"use client";

import { useCallback } from "react";
import { PlanChangeConfirm } from "@/components/billing/plan-change-confirm";
import {
  confirmTalentPlanChange,
  previewTalentPlanChange,
} from "@/app/(workspace)/[tenantSlug]/talent/settings/plan-change-actions";
import type { PlanChangeTarget } from "@/lib/billing/duplicate-subscription";
import { talentPlanDisplayName } from "@/lib/onboarding/plan-intent";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

/**
 * TUL-831 / TUL-833 · the in-app plan change for an existing talent subscriber,
 * as a modal: proration line items, a "Have a code?" box and an explicit
 * confirm. Every talent upgrade surface opens this when `startTalentUpgrade`
 * answers with a `planChange` target, instead of sending a paying customer to
 * the Stripe billing portal (which has no promo field and no preview).
 */
export function TalentPlanChangeModal({
  tenantSlug,
  target,
  initialCode,
  onDone,
  onCancel,
}: {
  tenantSlug: string;
  target: PlanChangeTarget;
  /** A code already applied on the surface that opened the modal. */
  initialCode?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const locale = useDashboardLocale();
  const { planKey, interval } = target;
  const preview = useCallback(
    (code: string | null) => previewTalentPlanChange(tenantSlug, planKey, interval ?? null, code),
    [tenantSlug, planKey, interval],
  );
  const confirm = useCallback(
    (prorationDate: number, code: string | null) =>
      confirmTalentPlanChange(tenantSlug, planKey, interval ?? null, prorationDate, code),
    [tenantSlug, planKey, interval],
  );
  // TUL-1897: one name source per locale for the target and the current plan.
  const name = talentPlanDisplayName(planKey, locale);
  const currentName = useCallback((plan: string) => talentPlanDisplayName(plan, locale), [locale]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl">
        <PlanChangeConfirm planName={name} currentPlanName={currentName} preview={preview} confirm={confirm} initialCode={initialCode ?? null} onDone={onDone} onCancel={onCancel} />
      </div>
    </div>
  );
}
