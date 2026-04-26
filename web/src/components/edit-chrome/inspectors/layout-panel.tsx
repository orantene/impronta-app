"use client";

/**
 * LayoutPanel — shared Layout tab for every section type.
 *
 * Implements builder-experience.html surface §2 (Inspector Layout tab).
 * Last reconciled: 2026-04-25.
 *
 * Reads/writes the platform `presentation` sub-schema: container width,
 * padding, alignment, mobile stack, visibility. Every section inherits
 * these via `sectionPresentationSchema`, so the panel works uniformly
 * regardless of type.
 *
 * Why Segmented chips and icon buttons rather than `<select>`:
 *   The presentation schema is finite-enum-only (e.g. paddingTop is one of
 *   five values). A pill-row makes the available choices and the active
 *   one legible at a glance — far better than a hidden dropdown the
 *   operator has to open to remember what's possible. The previous
 *   select-only build ("1995 website" — operator feedback, 2026-04-25)
 *   was the entire reason for the Phase B inspector pass.
 *
 * Patches (not whole values) are emitted — InspectorDock's
 * `handlePresentationPatch` merges into draftProps.presentation and
 * strips empty keys so the server treats them as "unset → theme default"
 * instead of invalid enum values. Selecting the active chip a second
 * time clears the field back to inherited.
 */

import {
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
} from "@/lib/site-admin/sections/shared/presentation";

import type { ReactElement } from "react";

import { Segmented, type SegmentedOption } from "../kit/segmented";
import { CHROME } from "../kit/tokens";

const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";
const FIELD_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.10em] text-zinc-500";
const INHERIT_HINT = "text-[10.5px] text-zinc-400";

interface LayoutPanelProps {
  presentation: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}

// Short pill labels — full descriptors live in PRESENTATION_OPTIONS for the
// dropdown shape but don't fit in chips. Keep these aligned with the enum
// values declared in `sectionPresentationSchema`; an unknown value falls
// back to the long label.
const SHORT_LABELS: Record<string, Record<string, string>> = {
  containerWidth: {
    narrow: "Narrow",
    standard: "Standard",
    wide: "Wide",
    editorial: "Editorial",
    "full-bleed": "Full",
  },
  paddingTop: {
    none: "None",
    tight: "Tight",
    standard: "Standard",
    airy: "Airy",
    editorial: "XL",
  },
  paddingBottom: {
    none: "None",
    tight: "Tight",
    standard: "Standard",
    airy: "Airy",
    editorial: "XL",
  },
  mobileStack: {
    default: "Stack",
    "single-column": "Single col",
    "horizontal-scroll": "Scroll",
  },
};

// Icon glyphs — used for chip-row affordances where iconography reads
// faster than copy (alignment, visibility, mobile layout).
const AlignLeftIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="17" y1="10" x2="3" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="17" y1="18" x2="3" y2="18" />
  </svg>
);
const AlignCenterIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="18" y1="10" x2="6" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="18" y1="18" x2="6" y2="18" />
  </svg>
);
const AlignRightIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="21" y1="10" x2="7" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="21" y1="18" x2="7" y2="18" />
  </svg>
);
const StackIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="4" y="3" width="16" height="5" rx="1" />
    <rect x="4" y="11" width="16" height="5" rx="1" />
    <rect x="4" y="19" width="16" height="2" rx="1" />
  </svg>
);
const SingleColIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="9" y="3" width="6" height="18" rx="1" />
  </svg>
);
const ScrollIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="2" y="6" width="6" height="12" rx="1" />
    <rect x="10" y="6" width="6" height="12" rx="1" />
    <line x1="20" y1="9" x2="22" y2="9" />
    <line x1="20" y1="15" x2="22" y2="15" />
  </svg>
);
const EyeIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const DesktopIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);
const MobileIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <line x1="11" y1="18" x2="13" y2="18" />
  </svg>
);
const HiddenIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-11-7-11-7a19.77 19.77 0 015.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 7 11 7a19.86 19.86 0 01-3.18 4.18" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const VISIBILITY_ICONS: Record<string, () => ReactElement> = {
  always: EyeIcon,
  "desktop-only": DesktopIcon,
  "mobile-only": MobileIcon,
  hidden: HiddenIcon,
};

const MOBILE_STACK_ICONS: Record<string, () => ReactElement> = {
  default: StackIcon,
  "single-column": SingleColIcon,
  "horizontal-scroll": ScrollIcon,
};

const ALIGN_ICONS: Record<string, () => ReactElement> = {
  left: AlignLeftIcon,
  center: AlignCenterIcon,
  right: AlignRightIcon,
};

export function LayoutPanel({ presentation, onPatch }: LayoutPanelProps) {
  const val = (key: string): string =>
    (presentation[key] as string | undefined) ?? "";

  /**
   * Toggle pattern: clicking the active chip clears the field back to
   * `undefined` (= inherit theme default). Clicking an inactive chip
   * sets it. This avoids needing a separate "Clear" button per row and
   * matches the mockup's progressive-disclosure feel.
   */
  function setOrToggle(key: string, next: string) {
    const current = val(key);
    onPatch({ [key]: current === next ? undefined : next });
  }

  function shortLabel(key: string, value: string): string {
    return (
      SHORT_LABELS[key]?.[value] ??
      PRESENTATION_OPTIONS[key as keyof typeof PRESENTATION_OPTIONS]?.find(
        (o) => o.value === value,
      )?.label ??
      value
    );
  }

  function chipOptions(
    key: string,
  ): ReadonlyArray<SegmentedOption<string>> {
    const opts =
      PRESENTATION_OPTIONS[key as keyof typeof PRESENTATION_OPTIONS] ?? [];
    return opts.map((o) => ({
      value: o.value,
      label: shortLabel(key, o.value),
    }));
  }

  function iconOptions(
    key: string,
    icons: Record<string, () => ReactElement>,
  ): ReadonlyArray<SegmentedOption<string>> {
    const opts =
      PRESENTATION_OPTIONS[key as keyof typeof PRESENTATION_OPTIONS] ?? [];
    return opts.map((o) => {
      const Icon = icons[o.value];
      return {
        value: o.value,
        label: Icon ? <Icon /> : shortLabel(key, o.value),
      };
    });
  }

  const containerValue = val("containerWidth");
  const padTopValue = val("paddingTop");
  const padBottomValue = val("paddingBottom");
  const alignValue = val("align");
  const mobileStackValue = val("mobileStack");
  const visibilityValue = val("visibility");

  return (
    <div className="flex flex-col gap-6">
      {/* ── Container ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Container</div>
          {!containerValue ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            {PRESENTATION_FIELD_LABELS.containerWidth}
          </span>
          <Segmented
            fullWidth
            compact
            value={containerValue}
            onChange={(next) => setOrToggle("containerWidth", next)}
            options={chipOptions("containerWidth")}
          />
        </div>
      </section>

      {/* ── Spacing ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Spacing</div>
          {!padTopValue && !padBottomValue ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : null}
        </div>
        {/* Visual diagram: a labelled rectangle showing where the padding
            sits, with chip rows for the two editable sides. Top/bottom is
            all the schema supports today (paddingLeft/Right are container
            concerns, not section). */}
        <div
          className="rounded-md p-3"
          style={{
            background: CHROME.paper,
            border: `1px solid ${CHROME.line}`,
          }}
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.10em]"
                style={{ color: CHROME.muted, width: 56 }}
              >
                Top
              </span>
              <Segmented
                fullWidth
                compact
                value={padTopValue}
                onChange={(next) => setOrToggle("paddingTop", next)}
                options={chipOptions("paddingTop")}
                style={{ flex: 1 }}
              />
            </div>
            <div
              className="rounded border-2 border-dashed py-3 text-center text-[10px] uppercase tracking-[0.12em]"
              style={{
                borderColor: CHROME.line,
                color: CHROME.muted2,
                background: CHROME.surface2,
              }}
              aria-hidden
            >
              Section content
            </div>
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.10em]"
                style={{ color: CHROME.muted, width: 56 }}
              >
                Bottom
              </span>
              <Segmented
                fullWidth
                compact
                value={padBottomValue}
                onChange={(next) => setOrToggle("paddingBottom", next)}
                options={chipOptions("paddingBottom")}
                style={{ flex: 1 }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Alignment ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Alignment</div>
          {!alignValue ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            {PRESENTATION_FIELD_LABELS.align}
          </span>
          <Segmented
            compact
            value={alignValue}
            onChange={(next) => setOrToggle("align", next)}
            options={iconOptions("align", ALIGN_ICONS)}
          />
        </div>
      </section>

      {/* ── Responsive (in-tab summary; the Responsive tab carries the
            full per-breakpoint editor) ──────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className={SECTION_TITLE}>Responsive</div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={FIELD_LABEL}>
              {PRESENTATION_FIELD_LABELS.mobileStack}
            </span>
            {!mobileStackValue ? (
              <span className={INHERIT_HINT}>Default</span>
            ) : null}
          </div>
          <Segmented
            fullWidth
            compact
            value={mobileStackValue}
            onChange={(next) => setOrToggle("mobileStack", next)}
            options={iconOptions("mobileStack", MOBILE_STACK_ICONS)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={FIELD_LABEL}>
              {PRESENTATION_FIELD_LABELS.visibility}
            </span>
            {!visibilityValue ? (
              <span className={INHERIT_HINT}>Always visible</span>
            ) : null}
          </div>
          <Segmented
            fullWidth
            compact
            value={visibilityValue}
            onChange={(next) => setOrToggle("visibility", next)}
            options={iconOptions("visibility", VISIBILITY_ICONS)}
          />
        </div>
      </section>
    </div>
  );
}
