"use client";

/**
 * TUL-829 · The one in-app upgrade modal for talent paywalls.
 *
 * Mount `<TalentUpgradeModalHost />` once per tree (the dashboard shell and
 * the bare builder route both do); any paywall then calls
 * `openUpgrade({ feature, from })`. Radix Dialog gives the focus trap, Esc
 * and scrim dismissal. Below `sm` the content is a bottom sheet (390px
 * friendly); from `sm` up it is the centred dialog.
 *
 * The single primary button calls `startUpgradeCheckout`, the adapter
 * TUL-830 swaps for real checkout.
 */

import * as React from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { cn } from "@/lib/utils";

import { startUpgradeCheckout } from "./start-upgrade-checkout";
import {
  buildUpgradeOffer,
  normalizeUpgradeLocale,
  type UpgradeInterval,
} from "./upgrade-modal-model";
import {
  claimUpgradeHost,
  closeUpgrade,
  getUpgradeSnapshot,
  subscribeUpgrade,
} from "./upgrade-store";

const SERVER_SNAPSHOT = { request: null, leader: null } as const;

export function TalentUpgradeModalHost({
  planLabel,
  onCompareAll,
}: {
  planLabel?: string | null;
  /** Opens the full plan comparison. Omitted where no comparison surface exists. */
  onCompareAll?: () => void;
}) {
  const [hostId, setHostId] = React.useState<number | null>(null);
  React.useEffect(() => {
    const { id, release } = claimUpgradeHost();
    setHostId(id);
    return release;
  }, []);

  const snap = React.useSyncExternalStore(
    subscribeUpgrade,
    getUpgradeSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const locale = normalizeUpgradeLocale(useDashboardLocale());
  const [interval, setInterval] = React.useState<UpgradeInterval>("m");

  const isLeader = hostId !== null && snap.leader === hostId;
  const request = isLeader ? snap.request : null;

  React.useEffect(() => {
    if (!request) return;
    setInterval("m");
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.upgrade_modal_shown, {
      feature: request.feature,
      from: request.from,
      locale,
    });
  }, [request, locale]);

  if (!isLeader) return null;

  const offer = buildUpgradeOffer({
    feature: request?.feature ?? "generic",
    interval,
    locale,
    planLabel,
  });

  const dismiss = () => {
    if (request) {
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.upgrade_modal_dismissed, {
        feature: request.feature,
        from: request.from,
      });
    }
    closeUpgrade();
  };

  const upgrade = () => {
    if (!request) return;
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.upgrade_modal_cta, {
      feature: request.feature,
      from: request.from,
      plan: offer.planKey,
      interval,
    });
    startUpgradeCheckout({ planKey: offer.planKey, interval, from: request.from });
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (open ? undefined : dismiss())}>
      <DialogContent
        title={offer.title}
        description={offer.subtitle}
        data-testid="talent-upgrade-modal"
        data-upgrade-feature={request?.feature}
        className={cn(
          "max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-y-0",
          "max-sm:rounded-b-none max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          "max-h-[92dvh] overflow-y-auto",
        )}
      >
        {offer.hasYearly ? (
          <div
            role="radiogroup"
            aria-label={offer.intervalLabel}
            className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 p-1"
          >
            {(["m", "y"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={interval === value}
                onClick={() => setInterval(value)}
                className={cn(
                  "min-h-11 rounded-md text-sm font-medium transition-colors",
                  interval === value ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                {value === "m" ? offer.monthlyLabel : offer.yearlyLabel}
              </button>
            ))}
          </div>
        ) : null}

        {offer.priceLabel ? (
          <p className="flex items-baseline gap-1.5" data-testid="talent-upgrade-price">
            <span className="font-display text-3xl font-medium">{offer.priceLabel}</span>
            <span className="text-sm text-muted-foreground">{offer.periodLabel}</span>
          </p>
        ) : null}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {offer.benefitsLabel}
          </p>
          <ul className="mt-2 grid gap-2 text-sm">
            {offer.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5 text-emerald-600">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={upgrade}
            data-testid="talent-upgrade-cta"
            className="min-h-11 w-full rounded-lg bg-foreground px-4 text-sm font-semibold text-background"
          >
            {offer.ctaLabel}
          </button>
          {onCompareAll ? (
            <button
              type="button"
              data-testid="talent-upgrade-compare"
              onClick={() => {
                dismiss();
                onCompareAll();
              }}
              className="min-h-11 w-full rounded-lg px-4 text-sm font-medium underline"
            >
              {offer.compareAllLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 w-full rounded-lg px-4 text-sm font-medium text-muted-foreground"
          >
            {offer.notNowLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
