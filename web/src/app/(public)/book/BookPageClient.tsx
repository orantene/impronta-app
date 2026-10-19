"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookableComposer,
  type BookableComposerClient,
} from "@/components/public-booking/BookableComposer";
import { pickBookableOffering } from "@/components/public-booking/pick-bookable-offering";
import { offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";
import { publicPriceLine } from "@/lib/talent/public-price-line";
import { bookPagePaymentLine } from "@/lib/talent/who-step-payment-copy";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";
import { usePublicT } from "@/i18n/use-public-t";
import { translatorFor } from "@/i18n/translator-for";
import { isRequestOnlyService, resolveSelectedOfferingId } from "./book-availability";
import { BookLocaleScope } from "./BookLocaleScope";

export function BookPageClient({
  tenantSlug,
  tenantId,
  agencyName,
  offerings,
  signedIn = false,
  client = null,
  captcha = null,
  locale: localeProp,
  contactHref = null,
  initialServiceId = "",
}: {
  tenantSlug: string;
  tenantId?: string | null;
  agencyName: string;
  offerings: Array<TalentOffering & { bookingMode?: "inquire" | "request" | "instant"; seatsLabel?: string | null; hasOpenTimes?: boolean | null }>;
  signedIn?: boolean;
  client?: BookableComposerClient | null;
  captcha?: GuestCaptchaConfig | null;
  /** Page/request locale — required on CMS Live booking so labels match the site. */
  locale?: string | null;
  /** Where a visitor with nothing to book can write to the studio (TUL-698). */
  contactHref?: string | null;
  /** TUL-65 Book again: opens on this service, bypassing the default picker. Ignored when not in `offerings`. */
  initialServiceId?: string;
}) {
  const [userPickedId, setUserPickedId] = useState("");
  const cookieT = usePublicT();
  const pageLocale = (localeProp?.trim() || "en").startsWith("es") ? "es" : "en";
  const t = useMemo(
    () => (localeProp?.trim() ? translatorFor(pageLocale) : cookieT),
    [localeProp, pageLocale, cookieT],
  );
  const selected = useMemo(() => {
    const id = resolveSelectedOfferingId({ offerings, requestedId: initialServiceId, userPickedId });
    return offerings.find((o) => o.id === id) ?? offerings[0] ?? null;
  }, [offerings, initialServiceId, userPickedId]);
  const noTimes = selected ? isRequestOnlyService(selected) : false;
  const bookable = selected
    ? pickBookableOffering([selected], { locationLabel: null })
    : null;

  // D-10a: an on_request service shows no amount and is never instant-booked.
  const requestOnly = selected?.visibility === "on_request";

  const priceLine = selected
    ? publicPriceLine(
        {
          amountCents: selected.amountCents,
          currency: selected.currency,
          priceDisplay: selected.priceDisplay,
          visibility: selected.visibility,
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
    <BookLocaleScope locale={pageLocale}>
    <div
      className="mt-8 flex flex-col gap-6"
      data-book-page-client=""
      data-book-selected={selected.id}
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
        {bookPagePaymentLine(selected, requestOnly ? "request" : selected.bookingMode === "instant" ? "instant" : "request", pageLocale)}
      </p>
      {offerings.length > 1 ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t("public.bookPage.chooseService")}</span>
          <select
            value={selected.id}
            onChange={(e) => setUserPickedId(e.target.value)}
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
      <div className="flex flex-col items-start gap-3" data-book-no-times={noTimes ? selected.id : undefined}>
        {noTimes ? (
          <p className="text-sm text-[var(--token-color-muted,rgba(11,11,13,0.62))]">
            {t("public.bookPage.noTimesRequest")}
          </p>
        ) : null}
        <BookableComposer
          tenantSlug={tenantSlug}
          tenantId={tenantId}
          agencyName={agencyName}
          offering={bookable}
          bookingMode={requestOnly ? "request" : selected.bookingMode === "instant" ? "instant" : "request"}
          signedIn={signedIn}
          client={client}
          captcha={captcha}
          locale={pageLocale}
          contactHref={contactHref}
          showInlinePicker={!noTimes}
          requestLabel={t("public.bookPage.requestCta")}
        />
        {noTimes && contactHref ? (
          <Link href={contactHref} className="text-sm underline">
            {t("public.bookPage.contactCta")}
          </Link>
        ) : null}
      </div>
    </div>
    </BookLocaleScope>
  );
}
