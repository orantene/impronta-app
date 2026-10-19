"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startTalentUpgrade } from "@/app/(workspace)/[tenantSlug]/talent/settings/stripe-talent-actions";
import { confirmTalentPlanChange, previewTalentPlanChange } from "@/app/(workspace)/[tenantSlug]/talent/settings/plan-change-actions";
import { PlanChangeConfirm } from "@/components/billing/plan-change-confirm";
import { upgradeOutcome } from "@/lib/billing/upgrade-outcome";
import { planIntentRunKey, sharedPlanIntentStart } from "@/lib/billing/plan-intent-start";
import type { PlanChangeTarget } from "@/lib/billing/duplicate-subscription";
import { planIntentLabel, type PaidTalentPlanKey } from "@/lib/onboarding/plan-intent";
import { useAdminShellOptional } from "@/components/admin/shell/internal/state";
import { readPromoCodeFromUrl } from "@/lib/billing/promo-code-param";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

/**
 * Opens the tier-compare drawer once when /talent/plan mounts (TUL-666).
 * TUL-828: when the URL carries a valid paid intent (`?plan=&interval=` from
 * /pricing via /start), start that checkout instead; any failure falls back to
 * the drawer so the person is never left on a blank page.
 * BILL-B: the intent arrives as a prop (parsed once by the server page).
 * TUL-831: the guard is "an outcome was applied", not "the action was fired".
 * A shell refresh can abort the action mid-flight (or drop its answer); the
 * old one-shot guard then never retried, so a downgrade sat on Settings with
 * no confirm. `sharedPlanIntentStart` retries a failed or silent attempt once,
 * and a remounted opener joins the run in flight instead of firing again.
 */
export function TalentPlanRouteOpener({
  intent,
}: {
  intent: { plan: PaidTalentPlanKey; interval: "month" | "year" } | null;
}) {
  const shell = useAdminShellOptional();
  const locale = useDashboardLocale();
  const openDrawer = shell?.openDrawer ?? null;
  const tenantSlug = shell?.tenantSlug ?? null;
  const done = useRef(false);
  const router = useRouter();
  const [change, setChange] = useState<PlanChangeTarget | null>(null);
  const plan = intent?.plan ?? null;
  const interval = intent?.interval ?? null;
  useEffect(() => {
    if (done.current || !openDrawer) return;
    if (!plan || !interval || !tenantSlug) {
      done.current = true;
      openDrawer("talent-tier-compare");
      return;
    }
    let live = true;
    sharedPlanIntentStart(planIntentRunKey(tenantSlug, plan, interval), () =>
      startTalentUpgrade(plan, tenantSlug, readPromoCodeFromUrl(), null, interval),
    )
      .then((result) => {
        if (!live || done.current) return;
        done.current = true;
        // TUL-831: an existing subscriber (upgrade or downgrade, trial or not)
        // confirms the change in-app.
        const outcome = upgradeOutcome(result);
        if (outcome.kind === "checkout") window.location.assign(outcome.url);
        else if (outcome.kind === "plan_change") setChange(outcome.target);
        else openDrawer("talent-tier-compare");
      })
      .catch(() => {
        if (!live || done.current) return;
        done.current = true;
        openDrawer("talent-tier-compare");
      });
    // A re-run (new openDrawer identity, StrictMode, remount) drops this
    // subscription and joins the same in-flight run; nothing fires twice.
    return () => {
      live = false;
    };
  }, [openDrawer, tenantSlug, plan, interval]);
  const slug = tenantSlug;
  const target = change;
  const preview = useCallback(
    () => previewTalentPlanChange(slug ?? "", target?.planKey ?? "", target?.interval ?? null),
    [slug, target],
  );
  const confirm = useCallback(
    (prorationDate: number) => confirmTalentPlanChange(slug ?? "", target?.planKey ?? "", target?.interval ?? null, prorationDate),
    [slug, target],
  );
  if (!target || !slug) return null;
  const name = planIntentLabel({ plan: target.planKey as "talent_pro" | "talent_portfolio", interval: target.interval }, locale);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl">
        <PlanChangeConfirm
          planName={name}
          preview={preview}
          confirm={confirm}
          onDone={() => {
            setChange(null);
            router.refresh();
          }}
          onCancel={() => {
            setChange(null);
            openDrawer?.("talent-tier-compare");
          }}
        />
      </div>
    </div>
  );
}
