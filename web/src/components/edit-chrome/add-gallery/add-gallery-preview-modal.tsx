"use client";

/**
 * AddGalleryPreviewModal — a "see how it looks" popup for the builder Add
 * Gallery. Clicking the Preview affordance on any gallery card opens this modal,
 * which LIVE-RENDERS the item's real node tree (not a static image) inside a
 * device-width <iframe> via the shared `DevicePreviewFrame`:
 *
 *   - Desktop frame = 1280px, Mobile frame = 390px.
 *   - Because each frame is a real iframe at the device width, responsive
 *     components reflow to their TRUE mobile/desktop layout, then the frame is
 *     scaled to fit the popup.
 *
 * Live-data blocks (connected sections / section embeds) pull real tenant data
 * and can't be rendered in isolation — those show a friendly explainer instead
 * of a broken frame.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { AddGalleryItem } from "@/lib/site-admin/add-gallery";
import { resolveAddGalleryInsertAction } from "@/lib/site-admin/add-gallery/insert";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { CHROME, Segmented } from "../kit";
import {
  DevicePreviewFrame,
  DesktopGlyph,
  MobileGlyph,
  type PreviewDevice,
} from "../preview/device-preview-frame";

/**
 * Per-card Preview affordance — a small eye button in the card's top-right
 * corner that opens the live-render preview popup. Rendered as a <span
 * role="button"> because the card itself is a <button> (nested buttons break
 * HTML + hydration, same constraint as AddGalleryCardInfo). Stops pointer/mouse
 * propagation so it never arms the drag or triggers an insert.
 */
export function GalleryPreviewTrigger({
  item,
  onPreview,
  rightOffset = 6,
}: {
  item: AddGalleryItem;
  onPreview: (item: AddGalleryItem) => void;
  rightOffset?: number;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Preview ${item.label}`}
      draggable={false}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPreview(item);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onPreview(item);
        }
      }}
      className="absolute top-[6px] z-[3] inline-flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
      style={{ right: rightOffset, color: CHROME.muted }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = CHROME.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = CHROME.muted;
      }}
    >
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </span>
  );
}

type ResolvedPreview =
  | { ok: true; node: BuilderNode }
  | { ok: false; reason: string };

/**
 * Turn a gallery item into a single renderable node, or a friendly reason why
 * it can't be previewed standalone. Native elements, section templates and
 * DB-backed templates all resolve to a concrete node; live-data embeds don't.
 */
function resolvePreviewNode(item: AddGalleryItem): ResolvedPreview {
  try {
    const action = resolveAddGalleryInsertAction(item);
    switch (action.type) {
      case "nativeNode":
      case "sectionTemplate":
      case "dbTemplate":
        return { ok: true, node: action.node };
      case "sectionEmbed":
      case "connectedNode":
        return {
          ok: false,
          reason:
            "This is a live data block. It pulls real content (talent, directory, collections) when added, so it can't be previewed on its own.",
        };
      default:
        return { ok: false, reason: "No preview is available for this item yet." };
    }
  } catch {
    return { ok: false, reason: "This item couldn't be rendered for preview." };
  }
}

export function AddGalleryPreviewModal({
  item,
  onClose,
}: {
  item: AddGalleryItem | null;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const resolved = useMemo(() => (item ? resolvePreviewNode(item) : null), [item]);

  // Escape closes the preview (capture so it wins over the gallery panel).
  useEffect(() => {
    if (!item) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [item, onClose]);

  if (!item) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${item.label}`}
      className="fixed inset-0 z-[10060] flex items-center justify-center p-[24px]"
      style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88vh] w-[min(900px,94vw)] flex-col overflow-hidden rounded-[16px] border"
        style={{
          background: CHROME.surface,
          borderColor: CHROME.line,
          boxShadow: "0 32px 80px -32px rgba(15, 23, 42, 0.5)",
        }}
      >
        <div
          className="flex shrink-0 items-center gap-[12px] border-b px-[18px] py-[12px]"
          style={{ borderColor: CHROME.line }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold" style={{ color: CHROME.ink }}>
              {item.label}
            </div>
            <div className="truncate text-[11px]" style={{ color: CHROME.muted }}>
              Live preview
            </div>
          </div>
          <Segmented
            value={device}
            onChange={setDevice}
            compact
            options={[
              { value: "desktop", label: "Desktop", icon: <DesktopGlyph /> },
              { value: "mobile", label: "Mobile", icon: <MobileGlyph /> },
            ]}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border-none bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
            style={{ color: CHROME.muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(24, 24, 27, 0.06)";
              e.currentTarget.style.color = CHROME.ink2;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = CHROME.muted;
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-auto p-[22px]"
          style={{ background: CHROME.paper }}
        >
          {resolved?.ok ? (
            <DevicePreviewFrame node={resolved.node} device={device} />
          ) : (
            <div
              className="mx-auto flex max-w-[360px] flex-col items-center justify-center gap-[8px] py-[56px] text-center"
              role="status"
            >
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={CHROME.muted} strokeWidth="1.6" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <span className="text-[13px] leading-snug" style={{ color: CHROME.muted }}>
                {resolved?.reason}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
