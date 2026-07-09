"use client";

/**
 * DevicePreviewFrame — renders ONE builder node into a device-width <iframe>,
 * scaled to fit the available width, so a block can be seen in its TRUE
 * desktop (1280px) and mobile (390px) layout (responsive media queries key off
 * the real iframe width). The iframe body is a React portal target, so the
 * renderer's <style>/<link> tags live inside the frame and never leak into the
 * editor chrome.
 *
 * Extracted from AddGalleryPreviewModal so BOTH the Add Gallery preview and the
 * AI "revise this block" preview share ONE canonical frame. The only additions
 * over the original are optional and default to the prior behavior:
 *   - `inheritThemeFromParent` clones the host page's stylesheets + token
 *     data-attributes into the frame, so a revise preview looks exactly like the
 *     themed page the block will land on (e.g. editorial-noir), not a white card.
 *   - `componentStyleDefaults` / `styleClasses` pass straight through to the
 *     renderer for full tenant-style fidelity when a caller has them.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import type { BuilderStyleClassRegistry } from "@/lib/site-admin/builder-node/style-classes";

import { CHROME } from "../kit";

export type PreviewDevice = "desktop" | "mobile";

export const DEVICE_WIDTH: Record<PreviewDevice, number> = {
  desktop: 1280,
  mobile: 390,
};

/** Min screen height the iframe is given before the real content is measured. */
const INITIAL_CONTENT_HEIGHT = 360;

export function DesktopGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export function MobileGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

/**
 * Copy the host page's theme into the iframe: token `data-*` attributes (which
 * select the active palette in token-presets.css) + a clone of every parent
 * stylesheet (so those token custom properties and any utility classes actually
 * resolve inside the frame). Best-effort — any failure falls back to white.
 */
function inheritTheme(doc: Document): string {
  try {
    const parentHtml = document.documentElement;
    for (const attr of Array.from(parentHtml.attributes)) {
      if (attr.name.startsWith("data-token")) {
        doc.documentElement.setAttribute(attr.name, attr.value);
      }
    }
    const sheets = document.head.querySelectorAll('link[rel="stylesheet"], style');
    for (const node of Array.from(sheets)) {
      doc.head.appendChild(node.cloneNode(true));
    }
    const canvas =
      getComputedStyle(parentHtml).getPropertyValue("--token-color-background").trim() ||
      getComputedStyle(document.body).backgroundColor ||
      "#ffffff";
    return canvas || "#ffffff";
  } catch {
    return "#ffffff";
  }
}

export function DevicePreviewFrame({
  node,
  device,
  inheritThemeFromParent = false,
  componentStyleDefaults,
  styleClasses,
}: {
  node: BuilderNode;
  device: PreviewDevice;
  inheritThemeFromParent?: boolean;
  componentStyleDefaults?: ComponentStyleDefaults;
  styleClasses?: BuilderStyleClassRegistry;
}) {
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
    const canvas = inheritThemeFromParent ? inheritTheme(doc) : "#ffffff";
    doc.documentElement.style.background = canvas;
    doc.body.style.margin = "0";
    doc.body.style.background = canvas;
    setMountEl(doc.body);
  }

  // Measure the rendered content height inside the iframe (re-measures as the
  // node/device changes and as fonts/images settle) so the frame has no inner
  // scrollbar and scales proportionally.
  useEffect(() => {
    if (!mountEl) return;
    const doc = mountEl.ownerDocument;
    const measure = () => {
      const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
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
                ...(componentStyleDefaults ? { componentStyleDefaults } : {}),
                ...(styleClasses ? { styleClasses } : {}),
              }),
              mountEl,
            )
          : null}
      </div>
    </div>
  );
}
