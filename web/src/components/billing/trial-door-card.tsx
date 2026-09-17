"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { loadTrialDoorOffer, type TrialDoorOffer } from "@/lib/server-actions/trial-door";
import { cn } from "@/lib/utils";

/**
 * The trial door card (docs/plans/onboarding/trial-and-card.md): one plan,
 * one price, the day the card is charged, one button, and "Not now". Rendered
 * inside the one upgrade modal when a door opened it; the plan grid never
 * shows behind it.
 *
 * `offer` is what the server resolved for this door. While it loads the card
 * shows the feature line only; when it resolves to null the parent falls
 * back to the plan grid.
 */
export function TrialDoorCard({
  door,
  feature,
  offer,
  pending,
  onStart,
  onNotNow,
}: {
  door: string;
  /** Already translated by the caller ("Custom domain"). */
  feature: string | null;
  offer: TrialDoorOffer | null | undefined;
  pending: boolean;
  onStart: (offer: TrialDoorOffer) => void;
  onNotNow: () => void;
}) {
  const t = useT();
  const shownRef = React.useRef(false);
  React.useEffect(() => {
    if (!offer || shownRef.current) return;
    shownRef.current = true;
    trackProductEvent("trial_door_shown", { door, plan: offer.planKey, trial_days: offer.trialDays });
  }, [door, offer]);

  const price = offer ? `$${(offer.monthlyPriceCents / 100).toFixed(offer.monthlyPriceCents % 100 === 0 ? 0 : 2)}` : "";
  const chargeDay = offer
    ? new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(new Date(offer.chargeDateIso))
    : "";
  const sentence = offer
    ? offer.trialDays > 0
      ? interpolate(t("dashboard.adminShared.trialDoor.sentenceTrial"), {
          plan: offer.planName,
          days: String(offer.trialDays),
          price,
          date: chargeDay,
        })
      : interpolate(t("dashboard.adminShared.trialDoor.sentenceNoTrial"), { plan: offer.planName, price })
    : null;
  const cta = offer
    ? offer.trialDays > 0
      ? interpolate(t("dashboard.adminShared.trialDoor.startTrial"), { days: String(offer.trialDays) })
      : interpolate(t("dashboard.adminShared.trialDoor.startPaid"), { plan: offer.planName })
    : null;

  return (
    <div className="px-6 pb-6 pt-6 sm:px-8" data-trial-door={door}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.22em]" style={{ color: "#5b5b62" }}>
            {feature ?? t("dashboard.adminShared.trialDoor.kicker")}
          </span>
          <Dialog.Title
            className="mt-1.5 font-display text-[22px] font-semibold tracking-[-0.015em] sm:text-[24px]"
            style={{ color: "#0b0b0d" }}
          >
            {offer
              ? interpolate(t("dashboard.adminShared.trialDoor.title"), { plan: offer.planName })
              : t("dashboard.adminShared.trialDoor.loading")}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[14px] leading-[1.55]" style={{ color: "#3a3a40" }}>
            {sentence ?? t("dashboard.adminShared.trialDoor.loadingLine")}
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label={t("dashboard.adminShared.trialDoor.close")}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[rgba(24,24,27,0.1)] bg-white text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </Dialog.Close>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={!offer || pending}
          onClick={() => offer && onStart(offer)}
          data-testid="trial-door-start"
          className={cn(
            "inline-flex h-11 items-center justify-center rounded-full px-6 text-[14px] font-semibold text-white transition-opacity",
            "bg-[#0b0b0d] disabled:opacity-50",
          )}
        >
          {pending ? t("dashboard.adminShared.trialDoor.opening") : (cta ?? "…")}
        </button>
        <button
          type="button"
          onClick={onNotNow}
          data-testid="trial-door-not-now"
          className="inline-flex h-11 items-center justify-center px-4 text-[14px] font-medium underline-offset-4 hover:underline"
          style={{ color: "#5b5b62" }}
        >
          {t("dashboard.adminShared.trialDoor.notNow")}
        </button>
      </div>
      <p className="mt-4 text-[12px] leading-[1.5]" style={{ color: "#7a7a82" }}>
        {t("dashboard.adminShared.trialDoor.footnote")}
      </p>
    </div>
  );
}

/** Loads the offer for a door once per open. */
export function useTrialDoorOffer(door: string | null, open: boolean): TrialDoorOffer | null | undefined {
  const [offer, setOffer] = React.useState<TrialDoorOffer | null | undefined>(undefined);
  React.useEffect(() => {
    if (!open || !door) {
      setOffer(undefined);
      return;
    }
    let cancelled = false;
    setOffer(undefined);
    void loadTrialDoorOffer(door).then((next) => {
      if (!cancelled) setOffer(next);
    });
    return () => {
      cancelled = true;
    };
  }, [door, open]);
  return offer;
}
