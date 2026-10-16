"use client";

/**
 * useDeviceFrameWarmKeep — TUL-397 / TUL-79 blank-frame re-ship.
 *
 * Eagerly mounts tablet + mobile iframes once the operator (or idle
 * prewarm) leaves desktop, tracks load, and holds the last ready frame
 * on screen while the newly selected tier finishes loading so the host
 * never paints a blank / skeleton-only card on device switch.
 */

import { useEffect, useState } from "react";

import type { EditDevice } from "./edit-context-types";
import {
  DEVICE_PREVIEW_TIERS,
  resolveDisplayedDeviceTier,
  shouldShowDeviceFrameSkeleton,
  type DeviceFrameTier,
} from "./device-frame-layout";
import { useDeviceFrameLoadTracking } from "./device-frame-skeleton";

const PREVIEW_TIER_SET: ReadonlySet<EditDevice> = new Set(DEVICE_PREVIEW_TIERS);

function isPreviewTier(d: EditDevice): d is "tablet" | "mobile" {
  return d === "tablet" || d === "mobile";
}

export function useDeviceFrameWarmKeep(input: {
  device: EditDevice;
  pageVersion: number | null | undefined;
  pageSlug: string | null | undefined;
  /** ms after mount to start background warm-keep while still on desktop. */
  idlePrewarmMs?: number;
}): {
  orderedVisited: EditDevice[];
  loadedTiers: ReadonlySet<EditDevice>;
  markTierLoaded: (tier: EditDevice) => void;
  displayedTier: EditDevice;
  showSkeleton: boolean;
} {
  const idlePrewarmMs = input.idlePrewarmMs ?? 800;
  const [everVisited, setEverVisited] = useState<ReadonlySet<EditDevice>>(
    () => new Set(),
  );
  const [holdTier, setHoldTier] = useState<DeviceFrameTier | null>(null);
  const { loadedTiers, markTierLoaded: markLoaded } = useDeviceFrameLoadTracking(
    input.pageVersion,
    input.pageSlug,
  );

  // Operator picked a device tier → warm-keep BOTH so Tablet↔Mobile is instant.
  useEffect(() => {
    if (!isPreviewTier(input.device)) return;
    setEverVisited((prev) => {
      if (prev.has("tablet") && prev.has("mobile")) return prev;
      const next = new Set(prev);
      next.add("tablet");
      next.add("mobile");
      return next;
    });
  }, [input.device]);

  // Idle prewarm while still on desktop so the first device click is already hot.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (everVisited.size > 0) return;
    const id = window.setTimeout(() => {
      setEverVisited(new Set(PREVIEW_TIER_SET));
    }, idlePrewarmMs);
    return () => window.clearTimeout(id);
  }, [everVisited.size, idlePrewarmMs]);

  // Remember the last ready tier so we can hold it while the next loads.
  useEffect(() => {
    if (!isPreviewTier(input.device)) return;
    if (!loadedTiers.has(input.device)) return;
    setHoldTier(input.device);
  }, [input.device, loadedTiers]);

  const markTierLoaded = (tier: EditDevice) => {
    markLoaded(tier);
    if (isPreviewTier(tier)) {
      setHoldTier((prev) => prev ?? tier);
    }
  };

  const orderedVisited: EditDevice[] = DEVICE_PREVIEW_TIERS.filter((d) =>
    everVisited.has(d),
  );

  const displayedTier = resolveDisplayedDeviceTier({
    activeDevice: input.device,
    loadedTiers,
    holdTier,
  });

  const showSkeleton = shouldShowDeviceFrameSkeleton({
    device: input.device,
    loadedTiers,
    holdTier,
  });

  return {
    orderedVisited,
    loadedTiers,
    markTierLoaded,
    displayedTier,
    showSkeleton,
  };
}
