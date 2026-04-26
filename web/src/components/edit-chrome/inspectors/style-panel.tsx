"use client";

/**
 * StylePanel — decorative + surface treatment for a section.
 *
 * Implements builder-experience.html surface §3 (Inspector Style tab).
 * Last reconciled: 2026-04-25.
 *
 * Replaces the original select-only build (Phase B.2 inspector pass —
 * "1995 website" operator feedback, 2026-04-25). The surface palette is
 * a swatch grid; the divider is a thumbnail gallery; the hero treatment
 * uses iconographic Segmented chips so the operator can read the choice
 * at a glance.
 *
 * Patches for presentation fields are wrapped under `__presentation` so
 * the dock's `handleStylePatch` routes them to the right merger. Root
 * payload patches (mood, overlay) go direct.
 *
 * Toggle-to-clear: clicking the active swatch / chip clears the field
 * back to `undefined` (= inherit theme default) — no separate "Reset"
 * button per row.
 */

import {
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
} from "@/lib/site-admin/sections/shared/presentation";

import { Segmented, type SegmentedOption } from "../kit/segmented";
import { Swatch } from "../kit/swatch";
import { CHROME } from "../kit/tokens";

const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";
const FIELD_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.10em] text-zinc-500";
const HINT = "text-[10.5px] leading-tight text-zinc-500";
const INHERIT_HINT = "text-[10.5px] text-zinc-400";

// Approximate hex for each background palette token. Real tenant rendering
// uses CSS variables from token-presets.css — these swatches are inspector
// affordances only, picked to read at a glance.
const BACKGROUND_SWATCHES: Record<
  string,
  { color: string; ringTone?: "light" | "dark" }
> = {
  canvas: { color:
    "linear-gradient(135deg, #ffffff 0%, #f4efe6 50%, #ffffff 100%)" },
  ivory: { color: "#fbf7ee" },
  champagne: { color: "#ecdcb8" },
  espresso: { color: "#2a201a", ringTone: "dark" },
  blush: { color: "#f3d7d2" },
  sage: { color: "#c5d2bd" },
  "muted-surface": { color: "#ebe6dc" },
};

const HERO_OVERLAY_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "gradient-scrim", label: "Scrim" },
  { value: "aurora", label: "Aurora" },
  { value: "soft-vignette", label: "Vignette" },
];

const HERO_MOOD_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  hint: string;
}> = [
  { value: "", label: "Default", hint: "Tenant theme picks the rhythm." },
  { value: "clean", label: "Clean", hint: "Tight rhythm, compact type." },
  {
    value: "editorial",
    label: "Editorial",
    hint: "Serif display, generous spacing.",
  },
  { value: "cinematic", label: "Cinematic", hint: "Oversized, dramatic." },
];

// Divider thumbnail — a small SVG that previews the visual treatment so
// the operator picks by appearance, not enum name.
function DividerPreview({ kind }: { kind: string }) {
  const stroke = CHROME.muted2;
  const accent = CHROME.ink;
  switch (kind) {
    case "thin-line":
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <line x1="2" y1="7" x2="42" y2="7" stroke={accent} strokeWidth="1" />
        </svg>
      );
    case "gradient-fade":
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <defs>
            <linearGradient id="grad-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={accent} stopOpacity="0" />
              <stop offset="50%" stopColor={accent} stopOpacity="0.8" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="0" y="6" width="44" height="2" fill="url(#grad-fade)" />
        </svg>
      );
    case "decorative":
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <line x1="2" y1="7" x2="18" y2="7" stroke={stroke} strokeWidth="1" />
          <circle cx="22" cy="7" r="2.5" fill="none" stroke={accent} strokeWidth="1" />
          <line x1="26" y1="7" x2="42" y2="7" stroke={stroke} strokeWidth="1" />
        </svg>
      );
    case "none":
    default:
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <line
            x1="2"
            y1="7"
            x2="42"
            y2="7"
            stroke={stroke}
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        </svg>
      );
  }
}

interface StylePanelProps {
  sectionTypeKey: string;
  draftProps: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function StylePanel({
  sectionTypeKey,
  draftProps,
  onPatch,
}: StylePanelProps) {
  const presentation =
    (draftProps.presentation as Record<string, unknown> | undefined) ?? {};
  const present = (key: string): string =>
    (presentation[key] as string | undefined) ?? "";
  const root = (key: string): string =>
    (draftProps[key] as string | undefined) ?? "";

  /**
   * Toggle pattern for presentation fields: clicking the active value
   * clears it back to `undefined` (= inherit theme default).
   */
  function setOrToggleP(key: string, next: string) {
    const current = present(key);
    onPatch({
      __presentation: { [key]: current === next ? undefined : next },
    });
  }

  function setOrToggleRoot(key: string, next: string) {
    const current = root(key);
    onPatch({ [key]: current === next ? undefined : next });
  }

  const backgroundValue = present("background");
  const dividerValue = present("dividerTop");
  const moodValue = root("mood");
  const overlayValue = root("overlay");

  return (
    <div className="flex flex-col gap-6">
      {/* ── Surface ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Surface</div>
          {!backgroundValue ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className={FIELD_LABEL}>
            {PRESENTATION_FIELD_LABELS.background}
          </span>
          {/* Swatch grid: each token is a circle, active gets a ring +
              subtle scale via Swatch's built-in `active` styling. */}
          <div
            className="grid items-center gap-2.5"
            style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
          >
            {PRESENTATION_OPTIONS.background.map((opt) => {
              const swatch = BACKGROUND_SWATCHES[opt.value];
              return (
                <Swatch
                  key={opt.value}
                  color={swatch?.color ?? "#ffffff"}
                  active={backgroundValue === opt.value}
                  onClick={() => setOrToggleP("background", opt.value)}
                  size={28}
                  title={opt.label}
                />
              );
            })}
          </div>
          <span className={HINT}>
            {backgroundValue
              ? (PRESENTATION_OPTIONS.background.find(
                  (o) => o.value === backgroundValue,
                )?.label ?? backgroundValue)
              : "Match canvas — follows the tenant theme."}
          </span>
        </div>
      </section>

      {/* ── Divider ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Top divider</div>
          {!dividerValue ? (
            <span className={INHERIT_HINT}>None</span>
          ) : null}
        </div>
        {/* Thumbnail gallery: each tile previews the divider treatment so
            the operator picks by sight. Includes "None" as a dashed
            placeholder so the empty state is itself a visible choice. */}
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
        >
          {PRESENTATION_OPTIONS.dividerTop.map((opt) => {
            const active = dividerValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setOrToggleP("dividerTop", opt.value)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-md py-2 transition-all"
                style={{
                  background: active ? CHROME.surface : CHROME.paper,
                  border: active
                    ? `1px solid ${CHROME.ink}`
                    : `1px solid ${CHROME.line}`,
                  boxShadow: active
                    ? "0 1px 3px rgba(0,0,0,0.08)"
                    : "none",
                  cursor: "pointer",
                }}
              >
                <DividerPreview kind={opt.value} />
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: active ? CHROME.ink : CHROME.muted }}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Hero treatment (only when section is a hero) ─────────────── */}
      {sectionTypeKey === "hero" ? (
        <section className="flex flex-col gap-3">
          <div className={SECTION_TITLE}>Hero treatment</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className={FIELD_LABEL}>Mood</span>
              {!moodValue ? (
                <span className={INHERIT_HINT}>Theme default</span>
              ) : null}
            </div>
            <Segmented
              fullWidth
              compact
              value={moodValue}
              onChange={(next) => setOrToggleRoot("mood", next)}
              options={HERO_MOOD_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
            <span className={HINT}>
              {HERO_MOOD_OPTIONS.find((o) => o.value === moodValue)?.hint ??
                ""}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className={FIELD_LABEL}>Overlay</span>
              {!overlayValue ? (
                <span className={INHERIT_HINT}>Theme default</span>
              ) : null}
            </div>
            <Segmented
              fullWidth
              compact
              value={overlayValue}
              onChange={(next) => setOrToggleRoot("overlay", next)}
              options={HERO_OVERLAY_OPTIONS}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
