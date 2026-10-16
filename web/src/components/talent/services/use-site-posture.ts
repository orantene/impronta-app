"use client";

import { useEffect, useState } from "react";
import { loadSellingDefaults } from "@/lib/talent/services-settings-actions";
import { PLATFORM_DEFAULT_BOOKING_POSTURE, type TalentBookingPosture } from "@/lib/talent/selling-booking-settings";

/** TUL-685: the talent's site-wide booking mode (read-only). Platform default until loaded. */
export function useSitePosture(talentProfileId: string | null | undefined): TalentBookingPosture {
  const [posture, setPosture] = useState<TalentBookingPosture>(PLATFORM_DEFAULT_BOOKING_POSTURE);
  useEffect(() => {
    if (!talentProfileId) return;
    let live = true;
    void loadSellingDefaults(talentProfileId).then((r) => {
      if (live && r.ok) setPosture(r.defaults.bookingPosture);
    });
    return () => {
      live = false;
    };
  }, [talentProfileId]);
  return posture;
}
