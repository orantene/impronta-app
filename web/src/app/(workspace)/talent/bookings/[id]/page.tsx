"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { TalentPageRouteSyncer } from "../../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

// Store the booking id so TalentRouter can pass it to AgendaBookingRecord.
// Uses sessionStorage so it survives soft-nav without polluting URL query.
export default function PlatformTalentBookingRecordPage() {
  // Next 16: a client page's `params` prop is a Promise; reading `params.id`
  // synchronously gave undefined and stored the string "undefined" (F44).
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : null;
  useEffect(() => {
    if (!id) return;
    try {
      sessionStorage.setItem("tulala:agenda:bookingId", id);
    } catch {
      // sessionStorage unavailable (SSR, private mode hardened)
    }
  }, [id]);

  return <TalentPageRouteSyncer page="booking-record" />;
}
