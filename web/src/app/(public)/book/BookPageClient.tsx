"use client";

import { useMemo, useState } from "react";
import { BookableComposer } from "@/components/public-booking/BookableComposer";
import { pickBookableOffering } from "@/components/public-booking/pick-bookable-offering";
import { useT } from "@/i18n/use-t";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";

export function BookPageClient({
  tenantSlug,
  tenantId,
  agencyName,
  offerings,
  signedIn = false,
  captcha = null,
}: {
  tenantSlug: string;
  tenantId?: string | null;
  agencyName: string;
  offerings: Array<TalentOffering & { bookingMode?: "inquire" | "request" | "instant"; seatsLabel?: string | null }>;
  signedIn?: boolean;
  captcha?: GuestCaptchaConfig | null;
}) {
  const t = useT();
  const [offeringId, setOfferingId] = useState(offerings[0]?.id ?? "");
  const selected = useMemo(
    () => offerings.find((o) => o.id === offeringId) ?? offerings[0] ?? null,
    [offerings, offeringId],
  );
  const bookable = selected
    ? pickBookableOffering([selected], { locationLabel: null })
    : null;

  if (offerings.length === 0 || !bookable) {
    return (
      <p className="mt-6 text-sm text-[var(--token-color-muted,rgba(11,11,13,0.62))]">
        {t("public.slotPicker.empty")}
      </p>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      {offerings.length > 1 ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t("public.bookPage.chooseService")}</span>
          <select
            value={selected.id}
            onChange={(e) => setOfferingId(e.target.value)}
            className="rounded-lg border border-[rgba(24,24,27,0.12)] bg-white px-3 py-2"
          >
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
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
      />
    </div>
  );
}
