"use client";

import { useEffect, useMemo, useState } from "react";
import { loadBookingHours } from "@/lib/server-actions/booking-hours";
import { availabilityFromHours } from "@/lib/talent/availability-from-hours";
import { publicationWord } from "@/lib/talent/publication-state";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";

export function useHasBookableHours(talentId: string): boolean | null {
  const [hasBookableHours, setHasBookableHours] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadBookingHours(talentId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setHasBookableHours(null);
        return;
      }
      setHasBookableHours(
        availabilityFromHours({
          hours: res.hours,
          byAgreement: res.proposal?.source === "by_agreement",
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [talentId]);
  return hasBookableHours;
}

export function useNeedsWorkingHoursBanner(
  items: TalentOffering[],
  hasBookableHours: boolean | null,
): boolean {
  return useMemo(() => {
    if (hasBookableHours !== false) return false;
    return items.some(
      (i) =>
        publicationWord(i) !== "archived" &&
        i.bookingMode === "instant" &&
        i.kind !== "product",
    );
  }, [items, hasBookableHours]);
}

export function ServicesHoursNeededBanner({ onOpen }: { onOpen: () => void }) {
  const copy = useDashboardText();
  return (
    <div
      className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
      data-testid="services-hours-needed"
    >
      <p>
        {copy.t(
          "Instant booking needs your working hours before clients can pick a time. Set them on Calendar.",
        )}
      </p>
      <button
        type="button"
        className="shrink-0 rounded-full bg-amber-950 px-3 py-1.5 text-[12px] font-semibold text-white"
        onClick={onOpen}
      >
        {copy.t("Open Calendar")}
      </button>
    </div>
  );
}
