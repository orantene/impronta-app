"use client";

/**
 * When the guest dock opens, surface any stashed Nail Studio look PNG in the
 * composer chip (upload happens on send).
 */

import { useEffect, useRef, useState } from "react";

import { clearPendingLookImage, peekPendingLookImage } from "./pending-look-image";

export function useLookPreviewOnOpen(open: boolean): {
  lookPreviewUrl: string | null;
  clearLookPreview: () => void;
  clearLookPreviewChip: () => void;
} {
  const [lookPreviewUrl, setLookPreviewUrl] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setLookPreviewUrl(peekPendingLookImage());
    }
    wasOpenRef.current = open;
  }, [open]);

  return {
    lookPreviewUrl,
    clearLookPreview: () => {
      clearPendingLookImage();
      setLookPreviewUrl(null);
    },
    clearLookPreviewChip: () => setLookPreviewUrl(null),
  };
}
