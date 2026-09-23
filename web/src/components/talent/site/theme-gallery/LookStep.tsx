"use client";

/**
 * LookStep — the LookRow (deliverable 0.C-1). A row of Look swatches (colors
 * + a font sample) that restyles the SAME preview instantly via
 * `preview.sendTokens` (no iframe reload, see `useThemePreview`). Same
 * radiogroup / lock / 44px contract as `DesignStep`.
 */
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import type { GalleryCatalogEntry } from "./types";
import { swatchToPreviewTokens } from "./types";
import type { useThemePreview } from "./useThemePreview";
import {
  themeGalleryCopy,
  themeGalleryLockedAria,
  themeGallerySelectLookAria,
  type ThemeGalleryLocale,
} from "./theme-gallery-i18n";

const RADIO_GROUP_NAME = "theme-gallery-look";

export function LookStep({
  looks,
  selectedSlug,
  currentSlug,
  locale,
  preview,
  onSelect,
}: {
  looks: GalleryCatalogEntry[];
  selectedSlug: string | null;
  currentSlug?: string | null;
  locale: ThemeGalleryLocale | string | undefined;
  preview: ReturnType<typeof useThemePreview>;
  onSelect: (look: GalleryCatalogEntry) => void;
}) {
  function pick(look: GalleryCatalogEntry) {
    if (look.locked) return;
    onSelect(look);
    // Instant restyle — same iframe document, no navigation.
    preview.sendTokens(swatchToPreviewTokens(look));
  }

  return (
    <div data-theme-gallery-look-step="">
      <div style={{ marginBottom: 10 }}>
        <div style={headingStyle}>{themeGalleryCopy(locale, "lookStepHeading")}</div>
        <p style={subtitleStyle}>{themeGalleryCopy(locale, "lookStepSubtitle")}</p>
      </div>

      {looks.length === 0 ? (
        <p style={subtitleStyle}>{themeGalleryCopy(locale, "emptyFilter")}</p>
      ) : (
        <div
          role="radiogroup"
          aria-label={themeGalleryCopy(locale, "lookStepHeading")}
          style={rowStyle}
        >
          {looks.map((look) => (
            <LookSwatch
              key={look.slug}
              look={look}
              checked={selectedSlug === look.slug}
              isCurrent={!!currentSlug && currentSlug === look.slug}
              locale={locale}
              onSelect={pick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LookSwatch({
  look,
  checked,
  isCurrent,
  locale,
  onSelect,
}: {
  look: GalleryCatalogEntry;
  checked: boolean;
  isCurrent: boolean;
  locale: ThemeGalleryLocale | string | undefined;
  onSelect: (look: GalleryCatalogEntry) => void;
}) {
  const swatch = look.preview?.swatch;
  const fontPreview = look.preview?.fontPreview;

  return (
    <label
      style={{
        ...swatchCardStyle,
        borderColor: checked ? COLORS.accent : COLORS.borderSoft,
        opacity: look.locked ? 0.72 : 1,
        cursor: look.locked ? "not-allowed" : "pointer",
      }}
      data-theme-gallery-look-swatch={look.slug}
      data-locked={look.locked ? "true" : "false"}
    >
      <input
        type="radio"
        name={RADIO_GROUP_NAME}
        value={look.slug}
        checked={checked}
        disabled={look.locked}
        onChange={() => onSelect(look)}
        aria-label={
          look.locked
            ? themeGalleryLockedAria(locale, look.title)
            : themeGallerySelectLookAria(locale, look.title)
        }
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />

      <div style={{ display: "flex", gap: 3 }} aria-hidden="true">
        {[swatch?.background, swatch?.primary, swatch?.secondary, swatch?.accent, swatch?.ink]
          .filter((c): c is string => !!c)
          .map((color, i) => (
            <span
              key={i}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: color,
                border: `1px solid ${COLORS.borderSoft}`,
              }}
            />
          ))}
      </div>

      {fontPreview ? (
        <span
          aria-hidden="true"
          style={{ fontSize: 15, fontFamily: fontPreview.heading || FONTS.display, color: COLORS.ink }}
        >
          {themeGalleryCopy(locale, "fontSample")}
        </span>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={labelStyle}>{look.title}</span>
        {isCurrent ? <span style={currentPillStyle}>{themeGalleryCopy(locale, "currentPill")}</span> : null}
        {look.locked ? <span style={lockedPillStyle}>{themeGalleryCopy(locale, "lockedPill")}</span> : null}
      </div>
    </label>
  );
}

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
  gap: 10,
};

const swatchCardStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  padding: 10,
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid",
  background: COLORS.surfaceAlt,
  fontFamily: FONTS.body,
  textAlign: "center",
};

const headingStyle: React.CSSProperties = {
  fontFamily: FONTS.display,
  fontSize: 15,
  fontWeight: 700,
  color: COLORS.ink,
};

const subtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12.5,
  color: COLORS.inkMuted,
  fontFamily: FONTS.body,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: COLORS.ink,
};

const currentPillStyle: React.CSSProperties = {
  padding: "1px 6px",
  borderRadius: 999,
  fontSize: 8.5,
  fontWeight: 700,
  textTransform: "uppercase",
  background: COLORS.indigoSoft,
  color: COLORS.indigoDeep,
};

const lockedPillStyle: React.CSSProperties = {
  padding: "1px 6px",
  borderRadius: 999,
  fontSize: 8.5,
  fontWeight: 700,
  textTransform: "uppercase",
  background: "rgba(17,17,17,0.72)",
  color: "#fff",
};
