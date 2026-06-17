"use client";

/**
 * Add Gallery card metadata primitives — the status badge, the label/description
 * copy block, and the derived per-item card state. Extracted from
 * add-gallery-panel.tsx (CANVAS-4 kept that file under the 800-line lint cap
 * after adding the shared template-applied toast wiring). Pure presentation +
 * one derived-state hook; no panel state.
 */

import {
  isAddGalleryItemAvailable,
  type AddGalleryItem,
} from "@/lib/site-admin/add-gallery";
import {
  getAddGalleryCardInfoTooltip,
  getAddGalleryCardShortDescription,
} from "@/lib/site-admin/add-gallery/card-display";
import { galleryItemSupportsDrag } from "@/lib/site-admin/add-gallery/insert";

import { CHROME } from "../kit";

export function GalleryStatusBadge({
  variant,
  className,
}: {
  variant: "soon" | "connected" | "advanced";
  className?: string;
}) {
  const styles =
    variant === "connected"
      ? {
          background: "rgba(124, 58, 237, 0.1)",
          color: CHROME.accent,
        }
      : variant === "advanced"
        ? {
            background: "rgba(15, 23, 42, 0.06)",
            color: CHROME.ink2,
          }
        : {
            background: CHROME.paper2,
            color: CHROME.muted,
          };

  const label =
    variant === "connected"
      ? "Connected"
      : variant === "advanced"
        ? "Advanced"
        : "Soon";

  return (
    <span
      className={`shrink-0 rounded-full px-[5px] py-[1px] text-[8px] font-bold uppercase tracking-[0.05em] ${className ?? ""}`}
      style={styles}
    >
      {label}
    </span>
  );
}

export function GalleryCardCopy({
  label,
  description,
  align = "center",
}: {
  label: string;
  description: string;
  align?: "center" | "left";
}) {
  return (
    <div className={`min-w-0 ${align === "center" ? "text-center" : "text-left"}`}>
      <span
        className="block text-[12px] font-semibold leading-tight"
        style={{ color: CHROME.ink }}
      >
        {label}
      </span>
      {description ? (
        <span
          className="mt-[3px] block line-clamp-1 text-[10px] leading-snug"
          style={{ color: CHROME.muted }}
        >
          {description}
        </span>
      ) : null}
    </div>
  );
}

export function useGalleryCardState(item: AddGalleryItem) {
  const comingSoon = !isAddGalleryItemAvailable(item);
  const advanced = item.availability === "advanced-hidden";
  const connected =
    item.tab === "connected" ||
    item.itemKind === "connected" ||
    Boolean(item.connectedSource);
  const draggable = galleryItemSupportsDrag(item);
  const shortDescription = getAddGalleryCardShortDescription(item);
  const infoTooltip = getAddGalleryCardInfoTooltip(item);
  return {
    comingSoon,
    advanced,
    connected,
    draggable,
    shortDescription,
    infoTooltip,
  };
}
