"use client";

/**
 * DesignStep — the Design grid (deliverable 0.C-1). Category filter chips
 * (All + categories present), a "New" badge from `isNew`, a lock pill on
 * tier-gated cards (never selectable, always reads "Web Office"), and native
 * radio semantics so the grid is a real radiogroup: arrow keys, screen
 * readers and 44px targets all come from the platform instead of being
 * hand-rolled. Built for ~5 cards today, a responsive `auto-fill` grid for
 * 40+ later.
 */
import { useMemo, useState } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import type { GalleryCatalogEntry } from "./types";
import {
  themeGalleryCategoryLabel,
  themeGalleryCopy,
  themeGalleryLockedAria,
  themeGallerySelectDesignAria,
  type ThemeGalleryLocale,
} from "./theme-gallery-i18n";

const RADIO_GROUP_NAME = "theme-gallery-design";

export function DesignStep({
  designs,
  selectedSlug,
  currentSlug,
  locale,
  onSelect,
}: {
  designs: GalleryCatalogEntry[];
  selectedSlug: string | null;
  currentSlug?: string | null;
  locale: ThemeGalleryLocale | string | undefined;
  onSelect: (design: GalleryCatalogEntry) => void;
}) {
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const d of designs) {
      if (d.category) seen.add(d.category);
    }
    return Array.from(seen);
  }, [designs]);

  const [category, setCategory] = useState<string | "all">("all");
  const visible = category === "all" ? designs : designs.filter((d) => d.category === category);

  return (
    <div data-theme-gallery-design-step="">
      <div style={{ marginBottom: 10 }}>
        <div style={headingStyle}>{themeGalleryCopy(locale, "designStepHeading")}</div>
        <p style={subtitleStyle}>{themeGalleryCopy(locale, "designStepSubtitle")}</p>
      </div>

      {categories.length > 0 ? (
        <div
          role="tablist"
          aria-label={themeGalleryCopy(locale, "designStepHeading")}
          style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}
        >
          <CategoryChip
            active={category === "all"}
            label={themeGalleryCopy(locale, "categoryAll")}
            onClick={() => setCategory("all")}
          />
          {categories.map((cat) => (
            <CategoryChip
              key={cat}
              active={category === cat}
              label={themeGalleryCategoryLabel(locale, cat)}
              onClick={() => setCategory(cat)}
            />
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p style={subtitleStyle}>{themeGalleryCopy(locale, "emptyFilter")}</p>
      ) : (
        <div
          role="radiogroup"
          aria-label={themeGalleryCopy(locale, "designStepHeading")}
          style={gridStyle}
        >
          {visible.map((design) => (
            <DesignCard
              key={design.slug}
              design={design}
              checked={selectedSlug === design.slug}
              isCurrent={!!currentSlug && currentSlug === design.slug}
              locale={locale}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DesignCard({
  design,
  checked,
  isCurrent,
  locale,
  onSelect,
}: {
  design: GalleryCatalogEntry;
  checked: boolean;
  isCurrent: boolean;
  locale: ThemeGalleryLocale | string | undefined;
  onSelect: (design: GalleryCatalogEntry) => void;
}) {
  const isNew = design.isNew;
  const swatch = design.preview?.swatch;

  return (
    <label
      style={{
        ...cardStyle,
        borderColor: checked ? COLORS.accent : COLORS.borderSoft,
        opacity: design.locked ? 0.72 : 1,
        cursor: design.locked ? "not-allowed" : "pointer",
      }}
      data-theme-gallery-design-card={design.slug}
      data-locked={design.locked ? "true" : "false"}
    >
      <input
        type="radio"
        name={RADIO_GROUP_NAME}
        value={design.slug}
        checked={checked}
        disabled={design.locked}
        onChange={() => {
          if (!design.locked) onSelect(design);
        }}
        aria-label={
          design.locked
            ? themeGalleryLockedAria(locale, design.title)
            : themeGallerySelectDesignAria(locale, design.title)
        }
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />

      <div style={thumbStyle}>
        {design.preview?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={design.preview.thumbnailUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : swatch ? (
          <div
            aria-hidden="true"
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
            }}
          >
            <span style={{ background: swatch.background }} />
            <span style={{ background: swatch.primary }} />
            <span style={{ background: swatch.accent }} />
          </div>
        ) : (
          <div aria-hidden="true" style={{ width: "100%", height: "100%", background: COLORS.surfaceAlt }} />
        )}

        {isNew ? <Badge tone="new">{themeGalleryCopy(locale, "newBadge")}</Badge> : null}
        {design.locked ? <Badge tone="locked">{themeGalleryCopy(locale, "lockedPill")}</Badge> : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={cardTitleStyle}>{design.title}</span>
        {isCurrent ? <Badge tone="current">{themeGalleryCopy(locale, "currentPill")}</Badge> : null}
      </div>
      {design.summary ? <p style={cardBlurbStyle}>{design.summary}</p> : null}
    </label>
  );
}

function CategoryChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        minHeight: 32,
        padding: "0 12px",
        borderRadius: 999,
        border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
        background: active ? COLORS.accentSoft : "#fff",
        color: active ? COLORS.ink : COLORS.inkMuted,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: FONTS.body,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "new" | "locked" | "current" }) {
  const palette =
    tone === "new"
      ? { bg: COLORS.successSoft, fg: COLORS.successDeep }
      : tone === "locked"
        ? { bg: "rgba(17,17,17,0.72)", fg: "#fff" }
        : { bg: COLORS.indigoSoft, fg: COLORS.indigoDeep };
  return (
    <span
      style={{
        ...(tone === "current"
          ? { position: "static" }
          : { position: "absolute", top: 6, ...(tone === "new" ? { left: 6 } : { right: 6 }) }),
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        background: palette.bg,
        color: palette.fg,
      }}
    >
      {children}
    </span>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 10,
};

const cardStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 10,
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid",
  background: COLORS.surfaceAlt,
  fontFamily: FONTS.body,
};

const thumbStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 8,
  aspectRatio: "4 / 3",
  border: `1px solid ${COLORS.borderSoft}`,
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

const cardTitleStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: COLORS.ink,
};

const cardBlurbStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: COLORS.inkMuted,
  lineHeight: 1.4,
};
