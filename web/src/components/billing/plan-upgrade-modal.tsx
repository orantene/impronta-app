"use client";

/**
 * PlanUpgradeModal: the one in-app upgrade dialog for talent paywalls
 * (TUL-829). One plan, its price, a Monthly / Yearly toggle (only when the
 * catalog sells yearly for that plan) and a single primary button.
 *
 * The button never decides the billing path itself. It calls
 * `upgradeTalentPlanFromModal`, which reads the talent's own subscription row
 * on the server and goes to Checkout (TUL-830), an in-place plan switch
 * (TUL-831) or the billing portal for a failed payment (TUL-835).
 */

import * as React from "react";
import { Lock, ShieldCheck } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { cn } from "@/lib/utils";
import { PLAN_CATALOG } from "@/lib/access/plan-catalog";
import { readPromoCodeFromUrl } from "@/lib/billing/promo-code-param";
import {
  offerIntervals,
  upgradeOfferPrice,
  type UpgradeRoute,
} from "@/lib/billing/upgrade-offer";
import type { BillingInterval } from "@/lib/pricing/interval-pricing";
import type { TalentPlanKey } from "@/lib/stripe/price-ids";
import {
  loadTalentYearlyCheckoutPlans,
  upgradeTalentPlanFromModal,
} from "@/app/(workspace)/[tenantSlug]/talent/settings/stripe-talent-actions";

export type PlanUpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  target: TalentPlanKey;
  /** Display hint only; the server re-decides from the talent's own row. */
  route?: UpgradeRoute;
  /** Already translated feature that hit the paywall, e.g. "Custom domain". */
  feature?: string | null;
};

export function PlanUpgradeModal({
  open,
  onOpenChange,
  tenantSlug,
  target,
  route = "checkout",
  feature = null,
}: PlanUpgradeModalProps) {
  const t = useT();
  const plan = PLAN_CATALOG[target];
  const [interval, setBillingInterval] = React.useState<BillingInterval>("month");
  const [yearlyPlans, setYearlyPlans] = React.useState<readonly TalentPlanKey[]>([]);
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    setMessage(null);
    loadTalentYearlyCheckoutPlans()
      .then((plans) => {
        if (live) setYearlyPlans(plans);
      })
      .catch(() => {
        if (live) setYearlyPlans([]);
      });
    return () => {
      live = false;
    };
  }, [open]);

  const yearlyAvailable = yearlyPlans.includes(target);
  const intervals = offerIntervals({ yearlyAvailable, route });
  const effective: BillingInterval = intervals.includes(interval) ? interval : "month";
  const price = upgradeOfferPrice({
    monthlyCents: plan.monthlyPriceCents,
    annualCents: plan.annualPriceCents,
    interval: effective,
    yearlyAvailable,
  });
  const yearlyPreview = upgradeOfferPrice({
    monthlyCents: plan.monthlyPriceCents,
    annualCents: plan.annualPriceCents,
    interval: "year",
    yearlyAvailable,
  });

  const cta =
    route === "plan_change"
      ? interpolate(t("dashboard.upgradeModal.ctaSwitch"), { plan: plan.displayName })
      : route === "fix_payment"
        ? t("dashboard.upgradeModal.ctaFixPayment")
        : t("dashboard.upgradeModal.ctaCheckout");

  const note =
    route === "plan_change"
      ? t("dashboard.upgradeModal.switchNote")
      : route === "fix_payment"
        ? t("dashboard.upgradeModal.fixPaymentNote")
        : price?.interval === "year"
          ? interpolate(t("dashboard.upgradeModal.billedYearly"), { amount: price.billed })
          : t("dashboard.upgradeModal.billedMonthly");

  function handleConfirm() {
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await upgradeTalentPlanFromModal(tenantSlug, target, effective, readPromoCodeFromUrl());
        if (result.ok && result.kind === "redirect") {
          window.location.assign(result.url);
          return;
        }
        if (result.ok) {
          setMessage({ tone: "ok", text: t("dashboard.upgradeModal.switched") });
          window.setTimeout(() => window.location.reload(), 4000);
          return;
        }
        setMessage({
          tone: "error",
          text: result.code === "same_plan" ? t("dashboard.upgradeModal.samePlan") : t("dashboard.upgradeModal.failed"),
        });
      } catch {
        setMessage({ tone: "error", text: t("dashboard.upgradeModal.failed") });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={interpolate(t("dashboard.upgradeModal.title"), { plan: plan.displayName })}
        description={
          feature
            ? interpolate(t("dashboard.upgradeModal.unlocks"), { feature, plan: plan.displayName })
            : (plan.tagline ?? undefined)
        }
        className="max-w-md gap-5 rounded-2xl p-5 sm:p-6"
        data-plan-upgrade-modal={target}
      >
        {intervals.length > 1 ? (
          <div
            role="radiogroup"
            aria-label={t("dashboard.upgradeModal.intervalLabel")}
            className="grid grid-cols-2 gap-1 rounded-full border border-border/60 bg-muted/50 p-1"
          >
            {intervals.map((value) => {
              const active = value === effective;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setBillingInterval(value)}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2",
                    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "year" ? t("dashboard.upgradeModal.yearly") : t("dashboard.upgradeModal.monthly")}
                  {value === "year" && yearlyPreview && yearlyPreview.savingsPercent > 0 ? (
                    <span className="rounded-full bg-emerald-600/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      {interpolate(t("dashboard.upgradeModal.save"), { percent: yearlyPreview.savingsPercent })}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {price ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">{price.perMonth}</span>
              <span className="text-sm text-muted-foreground">{t("dashboard.upgradeModal.perMonth")}</span>
            </div>
            <p className="text-sm text-muted-foreground">{note}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{note}</p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background",
              "transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2",
            )}
          >
            {route === "fix_payment" ? null : <Lock className="size-4" aria-hidden />}
            {pending ? t("dashboard.upgradeModal.working") : cta}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden />
            {t("dashboard.upgradeModal.secure")}
          </p>
          {message ? (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={cn(
                "text-center text-sm",
                message.tone === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-300",
              )}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
