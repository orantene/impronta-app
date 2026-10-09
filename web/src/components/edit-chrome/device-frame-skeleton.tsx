"use client";

/**
 * device-frame-skeleton — TUL-397 blank-frame cover for warm-kept device
 * iframes. Extracted from edit-shell so the shell stays under its size ratchet.
 */

import { useEffect, useState, type ReactNode } from "react";

import type { EditDevice } from "./edit-context-types";
import { shouldShowDeviceFrameSkeleton } from "./device-frame-layout";
import { useEditorLocale } from "./use-editor-locale";

/** Tracks which warm-kept tiers have fired `load`; resets on remount keys. */
export function useDeviceFrameLoadTracking(
  pageVersion: number | null | undefined,
  pageSlug: string | null | undefined,
): {
  loadedTiers: ReadonlySet<EditDevice>;
  markTierLoaded: (tier: EditDevice) => void;
} {
  const [loadedTiers, setLoadedTiers] = useState<ReadonlySet<EditDevice>>(
    () => new Set(),
  );
  useEffect(() => {
    setLoadedTiers(new Set());
  }, [pageVersion, pageSlug]);

  return {
    loadedTiers,
    markTierLoaded(tier) {
      setLoadedTiers((prev) => {
        if (prev.has(tier)) return prev;
        const next = new Set(prev);
        next.add(tier);
        return next;
      });
    },
  };
}

export function DeviceFrameSkeleton({
  device,
  loadedTiers,
}: {
  device: EditDevice;
  loadedTiers: ReadonlySet<EditDevice>;
}): ReactNode {
  const { t } = useEditorLocale();
  if (!shouldShowDeviceFrameSkeleton({ device, loadedTiers })) return null;
  return (
    <div
      data-device-frame-skeleton=""
      role="status"
      aria-live="polite"
      aria-label={t("Loading preview…")}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        background:
          "linear-gradient(180deg, rgba(249,249,251,0.98) 0%, rgba(244,244,245,0.98) 100%)",
        color: "rgba(24,24,27,0.55)",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {t("Loading preview…")}
    </div>
  );
}
