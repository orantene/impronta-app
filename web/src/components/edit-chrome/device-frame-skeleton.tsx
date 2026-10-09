"use client";

/**
 * device-frame-skeleton — frame-matching loading cover for warm-kept
 * tablet/phone iframes (TUL-397 + TUL-79 #12 / C1).
 *
 * Extracted from edit-shell so the shell stays under its size ratchet.
 * Matches DeviceFrameSurface iframe chrome (radius 16, shared shadow,
 * notch/bezel) with pulse content bars sized for phone vs tablet — not
 * a generic spinner card. Clears when the active tier fires `load`.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { EditDevice } from "./edit-context-types";
import { shouldShowDeviceFrameSkeleton } from "./device-frame-layout";
import { useEditorLocale } from "./use-editor-locale";
import { CHROME } from "./kit";

const FRAME_SHADOW =
  "0 24px 64px -16px rgba(0,0,0,0.30), 0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(24,24,27,0.08)";

/** Shared iframe + skeleton shadow so both stay visually locked. */
export const DEVICE_FRAME_SHADOW = FRAME_SHADOW;

const BAR: CSSProperties = {
  borderRadius: 10,
  background: CHROME.paper2,
};

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

  const tier =
    device === "tablet" || device === "mobile" || device === "compact"
      ? device
      : "tablet";
  const isPhone = tier === "mobile" || tier === "compact";
  const pad = isPhone ? 16 : 22;
  const label = t("Loading preview…");

  return (
    <div
      data-device-frame-skeleton={tier}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      className="animate-pulse"
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 16,
        boxShadow: FRAME_SHADOW,
        background: "#ffffff",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Device chrome: status/notch strip so the card reads as tablet/phone. */}
      <div
        data-device-frame-skeleton-bezel=""
        style={{
          flexShrink: 0,
          height: isPhone ? 28 : 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: `1px solid ${CHROME.line}`,
          background: CHROME.paper,
        }}
      >
        {isPhone ? (
          <div
            style={{
              width: 72,
              height: 8,
              borderRadius: 999,
              background: CHROME.paper2,
            }}
          />
        ) : (
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: CHROME.paper2,
            }}
          />
        )}
      </div>

      <div
        data-device-frame-skeleton-body=""
        style={{
          flex: 1,
          padding: pad,
          display: "grid",
          gap: isPhone ? 14 : 18,
          alignContent: "start",
          minHeight: 0,
        }}
      >
        <div style={{ ...BAR, height: isPhone ? 120 : 160 }} />
        <div style={{ ...BAR, height: 14, width: "72%" }} />
        <div style={{ ...BAR, height: 12, width: "48%" }} />
        {isPhone ? (
          <>
            <div style={{ ...BAR, height: 88 }} />
            <div style={{ ...BAR, height: 88 }} />
          </>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <div style={{ ...BAR, height: 110 }} />
            <div style={{ ...BAR, height: 110 }} />
          </div>
        )}
      </div>
    </div>
  );
}
