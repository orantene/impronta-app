"use client";

/**
 * Content panel · LAYOUT-INTENT CARDS (mockup annotation G).
 *
 * "The variant picker gets top billing — with pictures. Five named layout
 * intentions is the best idea in this tab, currently an unlabeled grey strip.
 * It is careful code (re-picking never clobbers your copy) and deserves to look
 * like the decision it is."
 *
 * What it replaced: `<Segmented fullWidth compact>` — five equal grey word
 * chips reading "Default Stack Row Grid Card-group", under the word "Variant",
 * which is a developer's word for the thing and tells an operator nothing about
 * what any of the five will do to the page.
 *
 * ── WHY A GLYPH MAP AND NOT A DERIVED PREVIEW ─────────────────────────────
 * The Style panel's quick-style thumbnails are derived from each preset's own
 * style object, because a style object fully describes its own look. A variant
 * is not that: it is a props patch whose visible effect lives in the renderer.
 * Deriving a picture from it would be guessing, so the pictures are AUTHORED —
 * one schematic per variant id, hand-checked against what the variant actually
 * produces.
 *
 * The cost of authoring is that a NEW variant arrives without a picture. That
 * case is handled honestly rather than with a plausible-looking wrong one:
 * `GENERIC` draws a neutral block, so an unmapped variant reads as "a choice we
 * have not illustrated" and never as a layout it does not produce.
 */

import type { ReactNode } from "react";

import { FIELD_KIT } from "./field-kit";
import { useInspectorT } from "./kit/use-inspector-t";
import { InspectorInfoTip } from "./kit/inspector-info-tip";

export interface VariantIntentOption {
  id: string;
  label: string;
}

export interface VariantIntentCardsProps {
  label: string;
  hint?: string;
  options: ReadonlyArray<VariantIntentOption>;
  value: string;
  onChange: (next: string) => void;
}

// ── Schematics ──────────────────────────────────────────────────────────────
//
// Every glyph is bars in a frame. Pure CSS, no assets, no icon font — the same
// discipline as `field-kit/glyph-tiles.tsx`, and for the same reason: a picker
// whose pictures can fail to load is worse than one with words.

const INK = "rgba(24,24,27,0.22)";
const INK_STRONG = "rgba(24,24,27,0.34)";

function Frame({ children, column = true }: { children: ReactNode; column?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: "flex",
        flexDirection: column ? "column" : "row",
        gap: 2,
        height: 30,
        padding: 3,
        borderRadius: 5,
        background: "rgba(24,24,27,0.04)",
      }}
    >
      {children}
    </span>
  );
}

function Bar({ grow = 1, ink = INK, w }: { grow?: number; ink?: string; w?: string }) {
  return (
    <span
      style={{
        flex: w ? "none" : grow,
        width: w,
        borderRadius: 1.5,
        background: ink,
      }}
    />
  );
}

function Outline({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        flex: 1,
        display: "flex",
        borderRadius: 2,
        background: "#fff",
        border: `1px solid ${INK}`,
      }}
    >
      {children}
    </span>
  );
}

const GENERIC = (
  <Frame>
    <Bar />
  </Frame>
);

const GLYPHS: Record<string, ReactNode> = {
  // Containers — the five the mockup draws.
  default: (
    <Frame>
      <Bar ink={INK_STRONG} />
      <Bar />
      <Bar />
    </Frame>
  ),
  stack: (
    <Frame>
      <Bar />
      <Bar />
    </Frame>
  ),
  row: (
    <Frame column={false}>
      <Bar />
      <Bar />
      <Bar />
    </Frame>
  ),
  grid: (
    <Frame column={false}>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <Bar />
        <Bar />
      </span>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <Bar />
        <Bar />
      </span>
    </Frame>
  ),
  "card-group": (
    <Frame column={false}>
      <Outline>{null}</Outline>
      <Outline>{null}</Outline>
    </Frame>
  ),

  // Text.
  title: (
    <Frame>
      <Bar grow={2} ink={INK_STRONG} />
      <Bar w="60%" />
    </Frame>
  ),
  subtitle: (
    <Frame>
      <Bar w="70%" />
      <Bar w="45%" />
    </Frame>
  ),
  intro: (
    <Frame>
      <Bar />
      <Bar />
      <Bar w="55%" />
    </Frame>
  ),
  caption: (
    <Frame>
      <Bar w="45%" />
    </Frame>
  ),
  quote: (
    <Frame column={false}>
      <Bar w="3px" ink={INK_STRONG} />
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <Bar />
        <Bar />
      </span>
    </Frame>
  ),

  // Buttons.
  "text-link": (
    <Frame>
      <span style={{ flex: 1 }} />
      <Bar w="50%" ink={INK_STRONG} />
    </Frame>
  ),
  "icon-button": (
    <Frame column={false}>
      <span
        style={{
          width: 10,
          borderRadius: 999,
          background: INK_STRONG,
        }}
      />
      <span style={{ flex: 1 }} />
    </Frame>
  ),
  "download-link": (
    <Frame column={false}>
      <Bar w="8px" ink={INK_STRONG} />
      <Bar />
    </Frame>
  ),

  // Images.
  "cover-image": (
    <Frame>
      <span style={{ flex: 1, borderRadius: 2, background: INK_STRONG }} />
    </Frame>
  ),
  logo: (
    <Frame column={false}>
      <span style={{ flex: 1 }} />
      <span style={{ width: 12, borderRadius: 2, background: INK_STRONG }} />
      <span style={{ flex: 1 }} />
    </Frame>
  ),

  // Cards.
  "image-card": (
    <Frame>
      <span style={{ flex: 2, borderRadius: 2, background: INK_STRONG }} />
      <Bar w="70%" />
    </Frame>
  ),
  "icon-card": (
    <Frame>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: INK_STRONG }} />
      <Bar w="80%" />
    </Frame>
  ),
  "profile-card": (
    <Frame column={false}>
      <span style={{ width: 10, borderRadius: 999, background: INK_STRONG }} />
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <Bar />
        <Bar />
      </span>
    </Frame>
  ),
  "service-card": (
    <Frame>
      <Bar ink={INK_STRONG} />
      <Bar />
      <Bar w="50%" />
    </Frame>
  ),
  "testimonial-card": (
    <Frame column={false}>
      <Bar w="3px" ink={INK_STRONG} />
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <Bar />
        <Bar w="60%" />
      </span>
    </Frame>
  ),
  "cta-card": (
    <Frame>
      <Bar w="70%" />
      <span style={{ height: 7, width: "45%", borderRadius: 2, background: INK_STRONG }} />
    </Frame>
  ),
};

export function VariantIntentCards({
  label,
  hint,
  options,
  value,
  onChange,
}: VariantIntentCardsProps) {
  const { t } = useInspectorT();

  return (
    <div className="flex flex-col gap-1.5" data-variant-intent-cards="">
      <span
        className="inline-flex items-center gap-1.5"
        style={{
          fontSize: FIELD_KIT.font.label,
          fontWeight: FIELD_KIT.weight.label,
          color: FIELD_KIT.ink,
        }}
      >
        {t(label)}
        {hint ? <InspectorInfoTip content={hint} title={label} /> : null}
      </span>
      <div
        role="radiogroup"
        aria-label={t(label)}
        style={{
          display: "grid",
          // The mockup's five-across, but as a MINIMUM tile width rather than a
          // fixed column count: `card` offers seven variants and a hard
          // `repeat(5, …)` would squeeze them to unreadable slivers.
          gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
          gap: FIELD_KIT.gap.tight,
        }}
      >
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-variant-intent={option.id}
              onClick={() => onChange(option.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "5px 4px 4px",
                minWidth: 0,
                borderRadius: FIELD_KIT.radius.tile,
                border: `1px solid ${selected ? FIELD_KIT.accent : FIELD_KIT.border}`,
                background: selected ? FIELD_KIT.accentFill : FIELD_KIT.surface,
                cursor: "pointer",
                transition: `border-color ${FIELD_KIT.motion.duration}ms ${FIELD_KIT.motion.easing}`,
              }}
            >
              {GLYPHS[option.id] ?? GENERIC}
              <span
                style={{
                  fontSize: FIELD_KIT.font.caption,
                  fontWeight: FIELD_KIT.weight.label,
                  lineHeight: 1.15,
                  textAlign: "center",
                  color: selected ? FIELD_KIT.accent : FIELD_KIT.muted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t(option.label)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
