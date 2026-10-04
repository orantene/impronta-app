"use client";

/**
 * Listens for `tulala:ask-question` (Nail Studio / booking-sheet Ask) and opens
 * the guest dock with optional text draft + look image.
 */

import { useEffect } from "react";

import { setPendingDraftMessage } from "./pending-draft-message";
import { setPendingLookImage } from "./pending-look-image";

export function useAskQuestionOpen(setOpen: (open: boolean) => void): void {
  useEffect(() => {
    const onAskQuestion = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        demo?: boolean;
        message?: unknown;
        imageDataUrl?: unknown;
      } | null;
      // Demo harness panels consume the event without a live dock write.
      if (detail?.demo === true) return;
      if (typeof detail?.message === "string") setPendingDraftMessage(detail.message);
      if (typeof detail?.imageDataUrl === "string") setPendingLookImage(detail.imageDataUrl);
      setOpen(true);
    };
    window.addEventListener("tulala:ask-question", onAskQuestion);
    return () => window.removeEventListener("tulala:ask-question", onAskQuestion);
  }, [setOpen]);
}
