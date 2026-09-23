"use client";

import { useEffect } from "react";

import { setPendingOfferingIntent } from "@/app/t/[profileCode]/_chat/pending-offering-intent";

/**
 * A `?service=` link is a signed choice, not an offering id. Opening the dock
 * from it does not navigate away.
 */
export function TalentOfferingIntentQuery() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const service = params.get("service");
    if (!service) return;
    setPendingOfferingIntent(service);
    window.dispatchEvent(new CustomEvent("tulala:offering-request"));
    const clean = () => setPendingOfferingIntent(null);
    window.addEventListener("tulala:open-guest-chat", clean);
    return () => window.removeEventListener("tulala:open-guest-chat", clean);
  }, []);
  return null;
}
