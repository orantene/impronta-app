"use client";

import { useEffect, useState } from "react";
import { loadTalentPendingPlanChange } from "@/app/(workspace)/[tenantSlug]/talent/settings/plan-change-actions";
import { formatPeriodDate } from "@/lib/billing/period-date";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { planDisplayNameFor } from "@/lib/access/plan-catalog";
import { planChangeTarget } from "@/lib/billing/duplicate-subscription";
import { FREE_TALENT_PLAN_KEY } from "@/lib/billing/plan-change-policy";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { useTalentPlanChange } from "@/components/billing/use-talent-plan-change";

/**
 * TUL-831 · "Switch to Free" for a paying talent. Opens the same confirm sheet as an upgrade, which says plainly when
 * the plan changes (the end of the paid period) and that nothing is charged or refunded today. The change itself is
 * made at Stripe (cancel at period end); the webhook drops the plan when the period ends.
 */
export function TalentSwitchToFree({ onChanged, className }: { onChanged?: () => void; className?: string }) {
  const { tenantSlug } = useAdminShell();
  const t = useT();
  const locale = useDashboardLocale();
  const [scheduledOn, setScheduledOn] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const planChange = useTalentPlanChange(tenantSlug ?? null, null, () => {
    setTick((n) => n + 1);
    onChanged?.();
  });
  // TUL-1914: when the switch to Free is already scheduled the button says so (the sheet it opens offers "Keep my plan").
  useEffect(() => {
    if (!tenantSlug) return;
    let live = true;
    void loadTalentPendingPlanChange(tenantSlug).then((r) => {
      if (live) setScheduledOn(r.ok && r.pending?.toPlan === FREE_TALENT_PLAN_KEY ? r.pending.effectiveAt : null);
    });
    return () => {
      live = false;
    };
  }, [tenantSlug, tick]);
  if (!tenantSlug) return null;
  return (
    <>
      <button
        type="button"
        data-testid="talent-switch-to-free"
        className={className ?? "mt-3 w-full rounded-md border px-3 py-2 text-sm font-semibold"}
        onClick={() => planChange.open(planChangeTarget(FREE_TALENT_PLAN_KEY, "month"))}
      >
        {scheduledOn
          ? interpolate(t("dashboard.adminShared.planChange.scheduledFree"), {
              date: formatPeriodDate(scheduledOn, locale) ?? "",
            })
          : interpolate(t("dashboard.adminShared.planChange.switchTo"), { plan: planDisplayNameFor("talent_basic", locale) })}
      </button>
      {planChange.modal}
    </>
  );
}
