"use client";

import { useEffect } from "react";
import { openMarketingSupport } from "@/lib/marketing/support-copy";

export function MarketingContactResume({ ticketId }: { ticketId: string }) {
  useEffect(() => {
    openMarketingSupport(ticketId);
  }, [ticketId]);
  return null;
}
