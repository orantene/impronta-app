"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookableComposer } from "@/components/public-booking/BookableComposer";
import { pickBookableOffering } from "@/components/public-booking/pick-bookable-offering";
import { translatorFor, useT } from "@/i18n/use-t";
import { offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";
import { publicPriceLine } from "@/lib/talent/public-price-line";
import { bookPagePaymentLine } from "@/lib/talent/who-step-payment-copy";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";

export function BookPageClient({
  tenantSlug,
  tenantId,
  agencyName,
  offerings,
  signedIn = false,
  captcha = null,
  locale: localeProp,
  contactHref = null,
}: {
  tenantSlug: string;
  tenantId?: string | null;
  agencyName: string;
  offerings: Array<TalentOffering & { bookingMode?: "inquire" | "request" | "instant"; seatsLabel?: string | null }>;
  signedIn?: boolean;
  captcha?: GuestCaptchaConfig | null;
  /** Page/request locale — required on CMS Live booking so labels match the site. */
  locale?: string | null;
  /** Where a visitor with nothing to book can write to the studio (TUL-698). */
  contactHref?: string | null;
}) {
  const cookieT = useT();
  const pageLocale = (localeProp?.trim() || "en").startsWith("es") ? "es" : "en";
  const t = useMemo(
    () => (localeProp?.trim() ? translatorFor(pageLocale) : cookieT),
    [localeProp, pageLocale, cookieT],
  );
  const [offeringId, setOfferingId] = useState(offerings[0]?.id ?? "");
  const selected = useMemo(
    () => offerings.find((o) => o.id === offeringId) ?? offerings[0] ?? null,
    [offerings, offeringId],
  );
  const bookable = selected
    ? pickBookableOffering([selected], { locationLabel: null })
    : null;

  const priceLine = selected
    ? publicPriceLine(
        {
          amountCents: selected.amountCents,
          currency: selected.currency,
          priceDisplay: selected.priceDisplay,
        },
        pageLocale,
      )
    : null;

  if (offerings.length === 0 || !bookable) {
    return (
      <div
        className="mt-6 flex flex-col items-start gap-3 text-sm text-[var(--token-color-muted,rgba(11,11,13,0.62))]"
        data-book-empty="no_services"
      >
        <p>{t("public.bookPage.noServices")}</p>
        {contactHref ? (
          <Link
            href={contactHref}
            className="rounded-lg border border-[rgba(24,24,27,0.12)] px-3 py-2 font-medium text-[var(--token-color-ink,#0B0B0D)]"
          >
            {t("public.bookPage.contactCta")}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="mt-8 flex flex-col gap-6"
      data-book-page-client=""
      style={{ color: "var(--token-color-ink, #0B0B0D)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-base font-medium">{selected.title}</p>
        {/* TUL-690 shared price + currency line; TUL-976 label when no exact price. */}
        <p className="text-sm font-medium tabular-nums" data-book-page-price="" data-book-page-amount="">
          {priceLine ?? offeringPriceLabel(selected, pageLocale)}
        </p>
      </div>
      {/* TUL-976: when it is paid, before any time is picked. */}
      <p className="-mt-4 text-sm text-[var(--token-color-muted,rgba(11,11,13,0.62))]" data-book-page-pay="">
        {bookPagePaymentLine(selected, selected.bookingMode === "instant" ? "instant" : "request", pageLocale)}
      </p>
      {offerings.length > 1 ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t("public.bookPage.chooseService")}</span>
          <select
            value={selected.id}
            onChange={(e) => setOfferingId(e.target.value)}
            className="rounded-lg border border-[rgba(24,24,27,0.12)] bg-white px-3 py-2 text-[var(--token-color-ink,#0B0B0D)]"
          >
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {`${o.title} · ${offeringPriceLabel(o, pageLocale)}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {/* The cohort count. Server-worded, because the sentence is decided by
          `seats-left.ts` and a page that re-words it becomes a second opinion
          about how many seats are left. Absent when nothing is known: an
          offering with no pool is unlimited, not full. */}
      {selected.seatsLabel ? (
        <p className="text-sm font-medium">{selected.seatsLabel}</p>
      ) : null}
      <BookableComposer
        tenantSlug={tenantSlug}
        tenantId={tenantId}
        agencyName={agencyName}
        offering={bookable}
        bookingMode={selected.bookingMode === "instant" ? "instant" : "request"}
        signedIn={signedIn}
        captcha={captcha}
        locale={pageLocale}
        contactHref={contactHref}
      />
    </div>
  );
}
