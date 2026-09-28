"use client";

/**
 * ThemeGalleryPreviewFrame — the live preview iframe shared by both gallery
 * steps. Visible loading / error / retry states (deliverable 0.C-1).
 */
import { useEffect, useRef, useState } from "react";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import type { ThemeGalleryLocale } from "./theme-gallery-i18n";
import { themeGalleryCopy } from "./theme-gallery-i18n";
import type { useThemePreview } from "./useThemePreview";

export function ThemeGalleryPreviewFrame({
  preview,
  url,
  locale,
  title,
  /** W71 — Maison setup uses exact fail copy; gallery keeps its own defaults. */
  errorTitle,
  errorBody,
  retryLabel,
  virtualWidth,
  aspectRatio,
}: {
  /** Render the page at this width and scale it down to the box (desktop thumbnail). */
  virtualWidth?: number;
  /** Box shape, e.g. "4 / 3". Defaults to the phone-shaped 9 / 16. */
  aspectRatio?: string;
  preview: ReturnType<typeof useThemePreview>;
  url: string;
  locale: ThemeGalleryLocale | string | undefined;
  title: string;
  errorTitle?: string;
  errorBody?: string;
  retryLabel?: string;
}) {
  const { iframeRef, loadState, attempt, onLoad, onError, beginLoad, retry } = preview;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!virtualWidth || !boxRef.current) return;
    const el = boxRef.current;
    const measure = () => setBoxSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtualWidth]);
  const scale = virtualWidth && boxSize && boxSize.w > 0 ? boxSize.w / virtualWidth : null;

  return (
    <div
      ref={boxRef}
      data-theme-gallery-preview=""
      style={{
        position: "relative",
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        minHeight: virtualWidth ? undefined : 320,
        aspectRatio: aspectRatio ?? "9 / 16",
        maxHeight: 640,
      }}
    >
      <iframe
        key={`${url}::${attempt}`}
        ref={iframeRef}
        src={url}
        title={title}
        onLoad={onLoad}
        onError={onError}
        onLoadStart={beginLoad}
        style={{
          width: scale ? virtualWidth : "100%",
          height: scale && boxSize ? boxSize.h / scale : "100%",
          transform: scale ? `scale(${scale})` : undefined,
          transformOrigin: "0 0",
          border: "none",
          display: "block",
          background: "#fff",
          visibility: loadState === "error" ? "hidden" : "visible",
        }}
      />

      {loadState === "loading" || loadState === "idle" ? (
        <PreviewOverlay>
          <Spinner />
          <span style={overlayText}>{themeGalleryCopy(locale, "previewLoading")}</span>
        </PreviewOverlay>
      ) : null}

      {loadState === "error" ? (
        <PreviewOverlay data-testid="maison-preview-fail">
          <span style={{ ...overlayText, color: COLORS.criticalDeep, fontWeight: 600 }}>
            {errorTitle ?? themeGalleryCopy(locale, "previewError")}
          </span>
          {errorBody ? (
            <span style={{ ...overlayText, textAlign: "center", maxWidth: 220 }}>{errorBody}</span>
          ) : null}
          <button type="button" onClick={retry} style={retryBtn} data-testid="maison-preview-retry">
            {retryLabel ?? themeGalleryCopy(locale, "previewRetry")}
          </button>
        </PreviewOverlay>
      ) : null}
    </div>
  );
}

function PreviewOverlay({
  children,
  ...rest
}: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      {...rest}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: "#fff",
      }}
    >
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        border: `2px solid ${COLORS.borderSoft}`,
        borderTopColor: COLORS.accent,
        animation: "theme-gallery-spin 0.8s linear infinite",
      }}
    >
      <style>{`@keyframes theme-gallery-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

const overlayText: React.CSSProperties = {
  fontFamily: FONTS.body,
  fontSize: 12.5,
  color: COLORS.inkMuted,
};

const retryBtn: React.CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.ink,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONTS.body,
};
