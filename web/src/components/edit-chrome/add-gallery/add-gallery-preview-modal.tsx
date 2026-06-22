"use client";

/**
 * AddGalleryPreviewModal — a "see how it looks" popup for the builder Add
 * Gallery. Clicking the Preview affordance on any gallery card opens this modal,
 * which LIVE-RENDERS the item's real node tree (not a static image) inside a
 * device-width <iframe>:
 *
 *   - Desktop frame = 1280px, Mobile frame = 390px.
 *   - Because each frame is a real iframe at the device width, responsive
 *     components reflow to their TRUE mobile/desktop layout (media queries key
 *     off the iframe width), then the frame is scaled to fit the popup.
 *
 * The render path is the same pure `renderBuilderNodes` the canvas + published
 * pages use, portaled into the iframe document so the renderer's <style>/<link>
 * tags are fully isolated from the editor chrome.
 *
 * Live-data blocks (connected sections / section embeds) pull real tenant data
 * and can't be rendered in isolation — those show a friendly explainer instead
 * of a broken frame.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AddGalleryItem } from "@/lib/site-admin/add-gallery";
import { resolveAddGalleryInsertAction } from "@/lib/site-admin/add-gallery/insert";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { CHROME, Segmented } from "../kit";

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

type PreviewDevice = "desktop" | "mobile";

const DEVICE_WIDTH: Record<PreviewDevice, number> = {
  desktop: 1280,
  mobile: 390,
};

/** Min screen height the iframe is given before the real content is measured. */
const INITIAL_CONTENT_HEIGHT = 360;

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

function DesktopGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function MobileGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

/**
 * DevicePreviewFrame — renders one node into a device-width iframe, scaled to
 * fit the available width. The iframe's body is the React portal target, so the
 * renderer's styles/fonts live inside the frame and never leak into the editor.
 */
function DevicePreviewFrame({ node, device }: { node: BuilderNode; device: PreviewDevice }) {
  const deviceWidth = DEVICE_WIDTH[device];
  const measureRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(INITIAL_CONTENT_HEIGHT);
  // Empty structural primitives (an empty Section / Container) render to nothing
  // until they hold content — show a hint instead of a blank frame.
  const [isEmpty, setIsEmpty] = useState(false);

  // Track the available width so we can scale the device frame to fit.
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Once the iframe document exists, use its <body> as the portal mount target.
  function handleIframeLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    doc.documentElement.style.background = "#ffffff";
    doc.body.style.margin = "0";
    doc.body.style.background = "#ffffff";
    setMountEl(doc.body);
  }

  // Measure the rendered content height inside the iframe (re-measures as the
  // node/device changes and as fonts/images settle) so the frame has no inner
  // scrollbar and scales proportionally.
  useEffect(() => {
    if (!mountEl) return;
    const doc = mountEl.ownerDocument;
    const measure = () => {
      const h = Math.max(
        doc.body.scrollHeight,
        doc.documentElement.scrollHeight,
      );
      if (h > 0) setContentHeight(h);
      // "Empty" = nothing rendered besides the renderer's <style>/<link> tags,
      // or content with no visible height (an empty layout row).
      const hasVisible = Array.from(doc.body.children).some((el) => {
        const tag = el.tagName;
        if (tag === "STYLE" || tag === "LINK" || tag === "SCRIPT") return false;
        return (el as HTMLElement).offsetHeight > 2;
      });
      setIsEmpty(!hasVisible);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(mountEl);
    const settle = setTimeout(measure, 350);
    return () => {
      ro.disconnect();
      clearTimeout(settle);
    };
  }, [mountEl, node, device]);

  const scale = containerWidth > 0 ? Math.min(1, containerWidth / deviceWidth) : 0.5;
  const scaledWidth = deviceWidth * scale;
  const scaledHeight = contentHeight * scale;

  return (
    <div ref={measureRef} style={{ width: "100%" }}>
      <div
        style={{
          width: isEmpty ? "100%" : scaledWidth || undefined,
          height: isEmpty ? 184 : scaledHeight || undefined,
          margin: "0 auto",
          position: "relative",
          overflow: "hidden",
          borderRadius: device === "mobile" ? 22 : 12,
          border: isEmpty ? `1px dashed ${CHROME.lineStrong}` : `1px solid ${CHROME.lineStrong}`,
          background: "#ffffff",
          boxShadow: isEmpty ? "none" : "0 18px 48px -24px rgba(15, 23, 42, 0.35)",
        }}
      >
        <iframe
          ref={iframeRef}
          onLoad={handleIframeLoad}
          title="Component preview"
          srcDoc="<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>"
          scrolling="no"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: deviceWidth,
            height: contentHeight,
            border: "none",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: "#ffffff",
            opacity: isEmpty ? 0 : 1,
          }}
        />
        {isEmpty ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-[8px] px-[24px] text-center"
            style={{ color: CHROME.muted }}
          >
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            <span className="text-[12px] leading-snug">
              This is an empty layout block. Add content to it after you insert it.
            </span>
          </div>
        ) : null}
        {mountEl
          ? createPortal(
              renderBuilderNodes([node], {
                publicPathPrefix: "",
                includeRendererStyles: true,
                includeFontLinks: true,
              }),
              mountEl,
            )
          : null}
      </div>
    </div>
  );
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
