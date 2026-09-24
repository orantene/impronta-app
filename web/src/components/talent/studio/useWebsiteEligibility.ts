"use client";

import { useEffect, useState } from "react";
import { loadBookingHours } from "@/lib/server-actions/booking-hours";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { availabilityFromHours } from "@/lib/talent/availability-from-hours";
import { getWebsiteEligibility, type WebsiteEligibilityInput } from "@/lib/talent/website-eligibility";
import { useAdminShell } from "@/components/admin/shell/internal/state";

type Cache = {
  talentId: string;
  bookableCount: number | null;
  hasAvailability: boolean | null;
};

let cache: Cache | null = null;

export function useWebsiteEligibility() {
  const { bridgeTalentSelfProfile } = useAdminShell();
  const talentId = bridgeTalentSelfProfile?.id ?? null;
  const [bookableCount, setBookableCount] = useState<number | null>(
    cache && cache.talentId === talentId ? cache.bookableCount : null,
  );
  const [hasAvailability, setHasAvailability] = useState<boolean | null>(
    cache && cache.talentId === talentId ? cache.hasAvailability : null,
  );

  useEffect(() => {
    if (!talentId) return;
    if (cache?.talentId === talentId && cache.hasAvailability != null && cache.bookableCount != null) {
      setBookableCount(cache.bookableCount);
      setHasAvailability(cache.hasAvailability);
      return;
    }
    let cancelled = false;
    void Promise.all([loadBookingHours(talentId), loadTalentOfferingsForEditor(talentId)]).then(
      ([hoursRes, offeringsRes]) => {
        if (cancelled) return;
        const nextAvail = hoursRes.ok
          ? availabilityFromHours({
              hours: hoursRes.hours,
              byAgreement: hoursRes.proposal?.source === "by_agreement",
            })
          : null;
        const nextCount = offeringsRes.ok
          ? offeringsRes.items.filter((item) => item.status !== "archived").length
          : null;
        cache = { talentId, bookableCount: nextCount, hasAvailability: nextAvail };
        setBookableCount(nextCount);
        setHasAvailability(nextAvail);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  const input: WebsiteEligibilityInput = {
    hasNameAndWork: bridgeTalentSelfProfile
      ? Boolean(bridgeTalentSelfProfile.displayName?.trim() && bridgeTalentSelfProfile.primaryTypeLabel)
      : null,
    photoCount: bridgeTalentSelfProfile ? bridgeTalentSelfProfile.portfolioCount : null,
    bookableCount,
    hasIntro: bridgeTalentSelfProfile ? bridgeTalentSelfProfile.hasBio : null,
    hasAvailability,
    hasPlace: bridgeTalentSelfProfile ? Boolean(bridgeTalentSelfProfile.homeCity) : null,
  };
  return {
    ...getWebsiteEligibility(input),
    bookableCount,
    hasAvailability,
    photoCount: bridgeTalentSelfProfile ? bridgeTalentSelfProfile.portfolioCount ?? null : null,
  };
}
