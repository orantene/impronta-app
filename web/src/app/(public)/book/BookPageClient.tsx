"use client";

import { useMemo, useState } from "react";
import { BookableComposer } from "@/components/public-booking/BookableComposer";
import { pickBookableOffering } from "@/components/public-booking/pick-bookable-offering";
import { useT } from "@/i18n/use-t";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function BookPageClient({
  tenantSlug,
  agencyName,
  offerings,
}: {
  tenantSlug: string;
  agencyName: string;
  offerings: TalentOffering[];
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
      <BookableComposer
        tenantSlug={tenantSlug}
        agencyName={agencyName}
        offering={bookable}
      />
    </div>
  );
}
