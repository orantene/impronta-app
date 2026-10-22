"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";

import type { Plan } from "./capability-catalog";
import { UpgradeModal } from "./upgrade-modal";
import { useUpgradeModal } from "./upgrade-context";
import { useAdminWorkspace } from "@/components/admin/workspace-context";
import { changeWorkspacePlan } from "@/lib/server-actions/admin-billing";
import { commitPlanDowngrade, getDowngradePreflight, type DowngradePreflight } from "@/lib/server-actions/admin-plan-downgrade";
import { DowngradeKeepPicker } from "./downgrade-keep-picker";
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { formatPeriodDate } from "@/lib/billing/period-date";
import { interpolate } from "@/i18n/interpolate";
import { startWorkspaceUpgrade } from "@/app/(workspace)/[tenantSlug]/admin/account/stripe-billing-actions";
import { readPromoCodeFromUrl } from "@/lib/billing/promo-code-param";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { SUPPORT_EMAIL } from "@/lib/platform/support-contact";
import type { TrialDoorOffer } from "@/lib/server-actions/trial-door";

/**
 * GlobalUpgradeModal — THE upgrade modal. One instance, mounted at the admin
 * shell, reached by every upgrade CTA in the product.
 *
 * Free downgrade  → changeWorkspacePlan (Stripe cancel at period end when subscribed; direct write only when not billed)
 * Studio / Agency → startWorkspaceUpgrade → Stripe Checkout redirect
 * Network         → mailto: sales handoff (no self-serve price yet)
 *
 * There is deliberately no local "set the plan" path here. A second modal used
 * to have one (`shell/internal/drawers/UpgradeModal.tsx`): its CTA flipped a
 * `useState` plan value, toasted "upgrade applied", and charged nothing, so the
 * shell unlocked cards the server still refused until the next reload. It was
 * deleted; if you are adding a plan-changing branch, it goes through a server
 * action or it does not exist.
 */
export function GlobalUpgradeModal({
  tenantSlug,
  activePlan: activePlanOverride,
}: {
  /**
   * Workspace slug for the checkout session. Falls back to
   * {@link useAdminWorkspace}; the SPA shell has the slug as a prop and no
   * AdminWorkspaceProvider above it, so it passes the value in directly.
   */
  tenantSlug?: string;
  /** Live plan tier. Same fallback story as `tenantSlug`. */
  activePlan?: Plan;
} = {}) {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const { open, reason, setOpen } = useUpgradeModal();
  const workspace = useAdminWorkspace();
  const [pending, startTransition] = React.useTransition();
  const t = useT();
  const locale = useDashboardLocale();
  // TUL-1291: owner keep-list picker (opens only when changeWorkspacePlan says the roster is above the Free cap).
  const [picker, setPicker] = React.useState<{ open: boolean; loading: boolean; preflight: DowngradePreflight | null }>({
    open: false,
    loading: false,
    preflight: null,
  });

  function planChangeToast(plan: string, scheduled: boolean, effectiveAt: string | null): string {
    if (!scheduled) return interpolate(t("dashboard.adminShared.planChange.setTo"), { plan });
    return effectiveAt
      ? interpolate(t("dashboard.adminShared.planChange.scheduledOn"), { plan, date: formatPeriodDate(effectiveAt, locale) ?? "" })
      : interpolate(t("dashboard.adminShared.planChange.scheduledEnd"), { plan });
  }

  function openKeepPicker() {
    setPicker({ open: true, loading: true, preflight: null });
    void getDowngradePreflight({ target_tier: "free" }).then((r) => {
      if (r.ok) {
        setPicker({ open: true, loading: false, preflight: r.preflight });
      } else {
        setPicker({ open: false, loading: false, preflight: null });
        toast.error(t("dashboard.adminShared.planChange.keepLoadFailed"));
      }
    });
  }

  function handleKeepConfirm(keepIds: string[]) {
    startTransition(async () => {
      const result = await commitPlanDowngrade({ target_tier: "free", talent_keep_ids: keepIds });
      if (result.ok) {
        toast.success(
          planChangeToast("free", result.stripe_scheduled, result.effective_at),
        );
        setPicker({ open: false, loading: false, preflight: null });
        queueRouterRefresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const activePlan: Plan = activePlanOverride ?? workspace?.plan ?? "free";
  const slug = tenantSlug ?? workspace?.slug;

  // Trial door: one plan, checkout returns to the spot the door opened from.
  function handleDoorStart(offer: TrialDoorOffer) {
    if (pending) return;
    if (!slug) {
      toast.error("Couldn't identify workspace.");
      return;
    }
    const door = reason?.door;
    if (!door) return;
    trackProductEvent("trial_door_started", { door, plan: offer.planKey, trial_days: offer.trialDays });
    const returnPath =
      reason?.returnPath ??
      (typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined);
    startTransition(async () => {
      const result = await startWorkspaceUpgrade(offer.planKey, slug, readPromoCodeFromUrl(), {
        id: door,
        returnPath: returnPath ?? null,
      });
      if (result.ok) {
        window.location.href = result.redirectUrl;
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSelect(plan: Plan) {
    if (pending) return;

    if (
      plan === "website" ||
      plan === "studio" ||
      plan === "agency" ||
      plan === "network"
    ) {
      if (!slug) {
        toast.error("Couldn't identify workspace.");
        return;
      }
      startTransition(async () => {
        const result = await startWorkspaceUpgrade(plan, slug, readPromoCodeFromUrl());
        if (result.ok) {
          window.location.href = result.redirectUrl;
        } else if (result.noStripe) {
          // Network has no self-serve price configured — hand off to support.
          // Same inbox as /get-started and every other public contact surface.
          window.open(
            `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Network setup")}`,
            "_blank",
          );
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
        toast.success(
          planChangeToast(plan, result.data.scheduledForPeriodEnd, result.data.effectiveAt),
        );
        queueRouterRefresh();
      } else if (result.needsKeepList) {
        openKeepPicker();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
    <UpgradeModal
      open={open}
      onOpenChange={setOpen}
      activePlan={activePlan}
      onSelect={handleSelect}
      reason={reason}
      doorPending={pending}
      onDoorStart={handleDoorStart}
    />
    <DowngradeKeepPicker
      open={picker.open}
      preflight={picker.preflight}
      loading={picker.loading}
      pending={pending}
      onConfirm={handleKeepConfirm}
      onCancel={() => setPicker({ open: false, loading: false, preflight: null })}
    />
    </>
  );
}
