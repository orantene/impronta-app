"use client";

import { useCallback } from "react";
import { PlanChangeConfirm } from "@/components/billing/plan-change-confirm";
import {
  cancelTalentPlanChange,
  confirmTalentPlanChange,
  previewTalentPlanChange,
} from "@/app/(workspace)/[tenantSlug]/talent/settings/plan-change-actions";
import type { PlanChangeTarget } from "@/lib/billing/duplicate-subscription";
import { planIntentLabel } from "@/lib/onboarding/plan-intent";
import { isKnownPlan, planDisplayNameFor } from "@/lib/access/plan-catalog";
import { isFreeTalentTarget } from "@/lib/billing/plan-change-policy";
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
  // TUL-831: "Switch to Free" names the free plan from the catalog; paid targets keep their upgrade-modal name.
  const name = isFreeTalentTarget(planKey)
    ? planDisplayNameFor("talent_basic", locale)
    : planIntentLabel({ plan: planKey as "talent_pro" | "talent_portfolio", interval }, locale);
  const currentName = useCallback(
    (plan: string) => (isKnownPlan(plan) ? planDisplayNameFor(plan, locale) : ""),
    [locale],
  );
  // TUL-1914: "Keep my plan" is the existing cancel-pending action (clears cancel_at_period_end); nothing new at Stripe.
  const keepPlan = useCallback(async () => {
    const out = await cancelTalentPlanChange(tenantSlug);
    if (out.ok) onDone();
    return out.ok ? ({ ok: true } as const) : ({ ok: false, error: out.error } as const);
  }, [tenantSlug, onDone]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl">
        <PlanChangeConfirm planName={name} currentPlanName={currentName} preview={preview} confirm={confirm} initialCode={initialCode ?? null} onKeepPlan={keepPlan} onDone={onDone} onCancel={onCancel} />
      </div>
    </div>
  );
}
