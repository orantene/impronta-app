"use client";

import { useEffect } from "react";
import { TalentPageRouteSyncer } from "../../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

export default function TenantTalentBookingRecordPage({
  params,
}: {
  params: { id: string };
}) {
  useEffect(() => {
    try {
      sessionStorage.setItem("tulala:agenda:bookingId", params.id);
    } catch {
      // sessionStorage unavailable
    }
  }, [params.id]);

  return <TalentPageRouteSyncer page="booking-record" />;
}
