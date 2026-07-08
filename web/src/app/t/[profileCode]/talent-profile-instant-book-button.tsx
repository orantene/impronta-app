"use client";

/**
 * TalentProfileInstantBookButton — public-talent-profile "Book now" CTA
 * (feature 6.4). Shown ALONGSIDE the inquiry button when the talent has opted
 * in to instant-book and the tenant has it enabled. Skips negotiation: one
 * confirm → createInstantBookingAction → the client lands on their messages
 * thread with a payment-requested booking.
 *
 * Auth: instant-book requires a signed-in client (the convert step needs the
 * client's session). A guest sees a "Sign in to book" prompt and falls back to
 * the normal Inquire flow.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { getTalentProfileInquireData } from "./talent-profile-inquire-data";
import { createInstantBookingAction } from "@/lib/server-actions/instant-book-action";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";

type Props = {
  talentId: string;
  displayName: string;
  tenantId: string;
  sourcePage: string;
  fixedRateDollars: number;
  currencyCode: string;
  /** Resolved page locale (from getRequestLocale on the profile page). */
  locale: string;
  className?: string;
};

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

export function TalentProfileInstantBookButton({
  talentId,
  displayName,
  tenantId,
  sourcePage,
  fixedRateDollars,
  currencyCode,
  locale,
  className,
}: Props) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pov, setPov] = useState<"client" | "guest" | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const loadedRef = useRef(false);

  const loadData = useCallback(() => {
    startSubmit(async () => {
      const result = await getTalentProfileInquireData();
      setPov(result.pov);
    });
  }, []);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadData();
    }
  }, [loadData]);

  const priceLabel = formatMoney(fixedRateDollars, currencyCode);
  const firstName = displayName.split(" ")[0] ?? displayName;

  const handleOpen = () => {
    setError(null);
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.start_inquiry, {
      talent_id: talentId,
      source_page: sourcePage,
      instant_book: true,
    });
    setOpen(true);
  };

  const handleConfirm = () => {
    setError(null);
    startSubmit(async () => {
      const res = await createInstantBookingAction({
        talentProfileId: talentId,
        tenantId,
        eventDate: eventDate || null,
        sourcePage,
      });
      if (res.ok) {
        router.push(res.redirectPath);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <>
      <Button type="button" onClick={handleOpen} className={className}>
        <Zap className="mr-1.5 h-4 w-4" aria-hidden />
        {interpolate(t("public.profileCta.bookNowPrice"), { price: priceLabel })}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <h2 className="text-lg font-semibold">
                {interpolate(t("public.profileCta.bookInstantly"), { name: firstName })}
              </h2>
              <button
                type="button"
                onClick={() => !submitting && setOpen(false)}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700"
                aria-label={t("public.profileCta.closeAria")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {pov === "guest" ? (
              <div className="space-y-3">
                <p className="text-sm text-neutral-600">
                  {t("public.profileCta.instantNeedsAccount")}
                </p>
                <Button type="button" className="w-full" onClick={() => router.push(`/login?next=${encodeURIComponent(sourcePage)}`)}>
                  {t("public.profileCta.signInToBook")}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-neutral-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-600">{t("public.profileCta.total")}</span>
                    <span className="font-semibold">{priceLabel}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {interpolate(t("public.profileCta.instantConfirmNote"), { name: firstName })}
                  </p>
                </div>

                <label className="block text-sm">
                  <span className="mb-1 block text-neutral-600">{t("public.profileCta.eventDateOptional")}</span>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </label>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}

                <Button type="button" className="w-full" disabled={submitting} onClick={handleConfirm}>
                  {submitting
                    ? t("public.profileCta.booking")
                    : interpolate(t("public.profileCta.confirmAndBook"), { price: priceLabel })}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
