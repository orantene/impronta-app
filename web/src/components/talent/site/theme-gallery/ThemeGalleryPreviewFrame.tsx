"use client";

/**
 * ThemeGalleryPreviewFrame — the live preview iframe shared by both gallery
 * steps. Visible loading / error / retry states (deliverable 0.C-1).
 */
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import type { ThemeGalleryLocale } from "./theme-gallery-i18n";
import { themeGalleryCopy } from "./theme-gallery-i18n";
import type { useThemePreview } from "./useThemePreview";

export function ThemeGalleryPreviewFrame({
  preview,
  url,
  locale,
  title,
}: {
  preview: ReturnType<typeof useThemePreview>;
  url: string;
  locale: ThemeGalleryLocale | string | undefined;
  title: string;
}) {
  const { iframeRef, loadState, attempt, onLoad, onError, beginLoad, retry } = preview;

  return (
    <div
      data-theme-gallery-preview=""
      style={{
        position: "relative",
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        minHeight: 320,
        aspectRatio: "9 / 16",
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
          width: "100%",
          height: "100%",
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
        <PreviewOverlay>
          <span style={{ ...overlayText, color: COLORS.criticalDeep }}>
            {themeGalleryCopy(locale, "previewError")}
          </span>
          <button type="button" onClick={retry} style={retryBtn}>
            {themeGalleryCopy(locale, "previewRetry")}
          </button>
        </PreviewOverlay>
      ) : null}
    </div>
  );
}

function PreviewOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
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
