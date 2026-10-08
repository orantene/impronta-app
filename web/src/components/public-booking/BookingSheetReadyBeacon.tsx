"use client";

import { useEffect } from "react";

import { announceTalentOpenReady } from "@/lib/talent-site/open-intent-client";

/**
 * Render directly after `CatalogBookingSheet`. Effects of earlier siblings run
 * first, so by the time this announces, the sheet's `tulala:offering-*`
 * listeners are attached and a queued `#book` intent can be handed over
 * (TUL-246). Renders nothing.
 */
export function BookingSheetReadyBeacon() {
  useEffect(() => announceTalentOpenReady("sheet"), []);
  return null;
}
