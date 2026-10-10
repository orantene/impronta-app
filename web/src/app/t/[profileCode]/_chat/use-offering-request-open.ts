"use client";

/**
 * Storefront CTA seam: `tulala:offering-request` opens the guest dock with the
 * clicked offering. TUL-246: wait briefly so CatalogBookingSheet can claim the
 * click via `tulala:maison-sheet` (same pattern as TalentInquiryFormSheet).
 * Also wires `tulala:open-guest-chat` + chat-channel ready announce.
 */

import { useEffect } from "react";

import { announceTalentOpenReady } from "@/lib/talent-site/open-intent-client";

import { setPendingOffering } from "./pending-offering-store";

export function useOfferingRequestOpen(setOpen: (open: boolean) => void): void {
  useEffect(() => {
    let sheetOpen = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSheet = (e: Event) => {
      sheetOpen = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
    };
    const onOfferingRequest = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (sheetOpen) return;
        if (detail && typeof detail === "object") setPendingOffering(detail);
        setOpen(true);
      }, 150);
    };
    window.addEventListener("tulala:maison-sheet", onSheet);
    window.addEventListener("tulala:offering-request", onOfferingRequest);
    const onOpenClean = () => {
      setPendingOffering(null);
      setOpen(true);
    };
    window.addEventListener("tulala:open-guest-chat", onOpenClean);
    const unready = announceTalentOpenReady("chat");
    return () => {
      unready();
      if (timer) clearTimeout(timer);
      window.removeEventListener("tulala:maison-sheet", onSheet);
      window.removeEventListener("tulala:offering-request", onOfferingRequest);
      window.removeEventListener("tulala:open-guest-chat", onOpenClean);
    };
  }, [setOpen]);
}
