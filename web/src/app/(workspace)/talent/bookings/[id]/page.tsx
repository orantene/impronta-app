"use client";

import { useEffect } from "react";
import { TalentPageRouteSyncer } from "../../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

// Store the booking id so TalentRouter can pass it to AgendaBookingRecord.
// Uses sessionStorage so it survives soft-nav without polluting URL query.
export default function PlatformTalentBookingRecordPage({
  params,
}: {
  params: { id: string };
}) {
  useEffect(() => {
    try {
      sessionStorage.setItem("tulala:agenda:bookingId", params.id);
    } catch {
      // sessionStorage unavailable (SSR, private mode hardened)
    }
  }, [params.id]);

  return <TalentPageRouteSyncer page="booking-record" />;
}
