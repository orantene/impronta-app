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
import { useEditorLocale } from "../use-editor-locale";

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

  const { t } = useEditorLocale();
  const label =
    variant === "connected"
      ? t("Connected")
      : variant === "advanced"
        ? t("Advanced")
        : t("Soon");

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
  // FIX #7 (i18n) — the add-block gallery CHROME (tabs, search, headings) was
  // already translated, but the 55 item CARDS were not: `item.label` and the
  // short description came straight off the section `meta.ts` files with no
  // `t()`, so a Spanish operator got a fully-Spanish frame around 55 English
  // section names. Translating here covers every card surface at once (grid
  // cards, section cards, list rows) because they all read this hook.
  //
  // `editorT` passes unknown strings through unchanged, so a section whose meta
  // copy is not in the catalog still renders its English name rather than a
  // blank card. Tenant-authored / connected-source items rely on that.
  const { t } = useEditorLocale();
  const comingSoon = !isAddGalleryItemAvailable(item);
  const advanced = item.availability === "advanced-hidden";
  const connected =
    item.tab === "connected" ||
    item.itemKind === "connected" ||
    Boolean(item.connectedSource);
  const draggable = galleryItemSupportsDrag(item);
  const rawTooltip = getAddGalleryCardInfoTooltip(item);
  const label = t(item.label);
  const shortDescription = t(getAddGalleryCardShortDescription(item));
  const infoTooltip = rawTooltip ? t(rawTooltip) : undefined;
  return {
    comingSoon,
    advanced,
    connected,
    draggable,
    label,
    shortDescription,
    infoTooltip,
  };
}
