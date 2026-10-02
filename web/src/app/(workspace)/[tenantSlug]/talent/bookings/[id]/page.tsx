"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { TalentPageRouteSyncer } from "../../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

export default function TenantTalentBookingRecordPage() {
  // Next 16: a client page's `params` prop is a Promise; reading `params.id`
  // synchronously gave undefined and stored the string "undefined" (F44).
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : null;
  useEffect(() => {
    if (!id) return;
    try {
      sessionStorage.setItem("tulala:agenda:bookingId", id);
    } catch {
      // sessionStorage unavailable
    }
  }, [id]);

  return <TalentPageRouteSyncer page="booking-record" />;
}
