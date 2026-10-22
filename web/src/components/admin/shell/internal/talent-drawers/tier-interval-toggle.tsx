"use client";

/**
 * TUL-1297: monthly / yearly switch for the talent plan upgrade buttons.
 * The hook reads which paid plans have a yearly catalog price; the switch
 * renders only when the plan being offered has one.
 */
import { useEffect, useState } from "react";
import { loadTalentYearlyCheckoutPlans } from "@/app/(workspace)/[tenantSlug]/talent/settings/stripe-talent-actions";
import { PLAN_CATALOG } from "@/lib/access/plan-catalog";
import { formatTalentPlanPrice } from "@/lib/billing/talent-plan-price";
import type { TalentPlanKey } from "@/lib/stripe/price-ids";

export type TierInterval = "month" | "year";

export function useYearlyPlans(): TalentPlanKey[] {
  const [plans, setPlans] = useState<TalentPlanKey[]>([]);
  useEffect(() => {
    let live = true;
    loadTalentYearlyCheckoutPlans()
      .then((p) => live && setPlans(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return plans;
}

/** Yearly catalog price for a plan, or null when it has none. USD only. */
export function planYearlyPrice(planKey: TalentPlanKey | undefined, locale: string): string | null {
  if (!planKey) return null;
  const cents = PLAN_CATALOG[planKey]?.annualPriceCents;
  if (typeof cents !== "number" || cents <= 0) return null;
  return formatTalentPlanPrice(cents, locale);
}

export function TierIntervalToggle({
  value,
  onChange,
  groupLabel,
  monthlyLabel,
  yearlyLabel,
}: {
  value: TierInterval;
  onChange: (v: TierInterval) => void;
  groupLabel: string;
  monthlyLabel: string;
  yearlyLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      data-testid="talent-upgrade-interval-toggle"
      className="mb-3 inline-flex gap-1 rounded-full border border-admin-border p-[3px]"
    >
      {(["month", "year"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 text-[12px] font-semibold ${value === v ? "bg-admin-ink text-white" : "text-admin-ink-muted"}`}
        >
          {v === "year" ? yearlyLabel : monthlyLabel}
        </button>
      ))}
    </div>
  );
}
