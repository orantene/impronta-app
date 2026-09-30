"use client";

import { useEffect, useRef, useState } from "react";
import { loadBookingHours } from "@/lib/server-actions/booking-hours";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { availabilityFromHours } from "@/lib/talent/availability-from-hours";
import {
  getWebsiteEligibility,
  inferWebsiteWorkingMode,
  type WebsiteEligibilityInput,
} from "@/lib/talent/website-eligibility";
import { combineAvailability } from "@/lib/talent/website-eligibility-facts";
import { useAdminShell } from "@/components/admin/shell/internal/state";

type Cache = {
  talentId: string;
  bookableCount: number | null;
  hasAvailability: boolean | null;
};

let cache: Cache | null = null;

/** Fired after any save that can change a checklist fact (services, hours, profile). */
export const WEBSITE_ELIGIBILITY_CHANGED_EVENT = "tulala:website-eligibility-changed";

/**
 * Drop the cached services / hours facts and tell every mounted checklist
 * (pill, sheet, Today card, Profile quality) to re-read. Call after a save.
 */
export function invalidateWebsiteEligibility(): void {
  cache = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WEBSITE_ELIGIBILITY_CHANGED_EVENT));
  }
}

export function useWebsiteEligibility() {
  const { bridgeTalentSelfProfile } = useAdminShell();
  const talentId = bridgeTalentSelfProfile?.id ?? null;
  // Start empty on every mount so server HTML and the hydrating client agree;
  // the module cache is applied in the effect below.
  const [bookableCount, setBookableCount] = useState<number | null>(null);
  const [hoursAvailability, setHoursAvailability] = useState<boolean | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(WEBSITE_ELIGIBILITY_CHANGED_EVENT, bump);
    return () => window.removeEventListener(WEBSITE_ELIGIBILITY_CHANGED_EVENT, bump);
  }, []);

  // A router refresh (every profile-drawer save runs one) hands us a new
  // bridge profile object; treat that as "facts may have changed" too.
  const lastProfileRef = useRef(bridgeTalentSelfProfile);
  useEffect(() => {
    if (lastProfileRef.current === bridgeTalentSelfProfile) return;
    lastProfileRef.current = bridgeTalentSelfProfile;
    cache = null;
    setVersion((v) => v + 1);
  }, [bridgeTalentSelfProfile]);

  useEffect(() => {
    if (!talentId) return;
    if (cache?.talentId === talentId && cache.hasAvailability != null && cache.bookableCount != null) {
      setBookableCount(cache.bookableCount);
      setHoursAvailability(cache.hasAvailability);
      return;
    }
    let cancelled = false;
    void Promise.all([
      loadBookingHours(talentId),
      loadTalentOfferingsForEditor(talentId),
    ]).then(
      ([hoursRes, offeringsRes]) => {
        if (cancelled) return;
        // Either writer counts: Services hours or the drawer's saved pattern.
        const nextAvail = combineAvailability({
          pattern: hoursRes.ok ? hoursRes.hasAvailabilityPattern : null,
          hours: hoursRes.ok
            ? availabilityFromHours({
                hours: hoursRes.hours,
                byAgreement: hoursRes.proposal?.source === "by_agreement",
              })
            : null,
        });
        const nextCount = offeringsRes.ok
          ? offeringsRes.items.filter((item) => item.status !== "archived").length
          : null;
        cache = { talentId, bookableCount: nextCount, hasAvailability: nextAvail };
        setBookableCount(nextCount);
        setHoursAvailability(nextAvail);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [talentId, version]);

  // Profile-drawer facts arrive on the bridge profile, which the drawer's
  // router refresh replaces after every save, so they need no cache bust.
  const hasAvailability = combineAvailability({
    pattern: bridgeTalentSelfProfile?.hasAvailabilityPattern ?? null,
    hours: hoursAvailability,
  });

  const workingMode = inferWebsiteWorkingMode(bridgeTalentSelfProfile?.primaryTypeLabel);
  const input: WebsiteEligibilityInput = {
    hasNameAndWork: bridgeTalentSelfProfile
      ? Boolean(bridgeTalentSelfProfile.displayName?.trim() && bridgeTalentSelfProfile.primaryTypeLabel)
      : null,
    photoCount: bridgeTalentSelfProfile ? bridgeTalentSelfProfile.portfolioCount : null,
    bookableCount,
    hasIntro: bridgeTalentSelfProfile ? bridgeTalentSelfProfile.hasBio : null,
    hasAvailability,
    hasPlace: bridgeTalentSelfProfile ? Boolean(bridgeTalentSelfProfile.homeCity) : null,
    workingMode,
  };
  return {
    ...getWebsiteEligibility(input),
    bookableCount,
    hasAvailability,
    photoCount: bridgeTalentSelfProfile ? bridgeTalentSelfProfile.portfolioCount ?? null : null,
  };
}
