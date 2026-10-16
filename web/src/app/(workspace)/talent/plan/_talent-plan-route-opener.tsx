"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startTalentUpgrade } from "@/app/(workspace)/[tenantSlug]/talent/settings/stripe-talent-actions";
import { confirmTalentPlanChange, previewTalentPlanChange } from "@/app/(workspace)/[tenantSlug]/talent/settings/plan-change-actions";
import { PlanChangeConfirm } from "@/components/billing/plan-change-confirm";
import { upgradeOutcome } from "@/lib/billing/upgrade-outcome";
import type { PlanChangeTarget } from "@/lib/billing/duplicate-subscription";
import { planIntentLabel } from "@/lib/onboarding/plan-intent";
import { useAdminShellOptional } from "@/components/admin/shell/internal/state";
import { readPromoCodeFromUrl } from "@/lib/billing/promo-code-param";
import { isTalentIntent, readPlanIntentFromUrl } from "@/lib/onboarding/plan-intent";

/**
 * Opens the tier-compare drawer once when /talent/plan mounts (TUL-666).
 * TUL-828: when the URL carries a valid paid intent (`?plan=&interval=` from
 * /pricing via /start), start that checkout instead; any failure falls back to
 * the drawer so the person is never left on a blank page.
 */
export function TalentPlanRouteOpener() {
  const shell = useAdminShellOptional();
  const openDrawer = shell?.openDrawer ?? null;
  const tenantSlug = shell?.tenantSlug ?? null;
  const ran = useRef(false);
  const router = useRouter();
  const [change, setChange] = useState<PlanChangeTarget | null>(null);
  useEffect(() => {
    if (ran.current || !openDrawer) return;
    ran.current = true;
    const intent = readPlanIntentFromUrl();
    if (!isTalentIntent(intent) || !tenantSlug) {
      openDrawer("talent-tier-compare");
      return;
    }
    void startTalentUpgrade(intent.plan, tenantSlug, readPromoCodeFromUrl(), null, intent.interval)
      .then((result) => {
        // TUL-831: an existing subscriber confirms the change in-app.
        const outcome = upgradeOutcome(result);
        if (outcome.kind === "checkout") window.location.assign(outcome.url);
        else if (outcome.kind === "plan_change") setChange(outcome.target);
        else openDrawer("talent-tier-compare");
      })
      .catch(() => openDrawer("talent-tier-compare"));
  }, [openDrawer, tenantSlug]);
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
  const name = planIntentLabel({ plan: target.planKey as "talent_pro" | "talent_portfolio", interval: target.interval });
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
