"use client";

/**
 * ResponsivePanel — per-viewport overrides over the shared Layout schema.
 *
 * Implements builder-experience.html surface §4 (Inspector Responsive tab).
 * Last reconciled: 2026-04-25.
 *
 * Reads `presentation.breakpoints.{tablet,mobile}` and exposes the same six
 * Layout fields per breakpoint with chip-row + Swatch affordances. The
 * active breakpoint follows the topbar's device switcher (`useEditContext`
 * `device`) so the canvas preview and inspector stay in lockstep — picking
 * a chip while on the Tablet device immediately re-renders the canvas at
 * tablet width.
 *
 * Inheritance is the marquee feature here: every chip row shows BOTH the
 * desktop base value (greyed, with a corner dot) AND the active override
 * (filled). Clicking the active override clears it back to inherit. Storefront
 * CSS already handles the cascade — see Phase 6 block in token-presets.css —
 * so an unset field falls through naturally with no JS at render time.
 *
 * Patch shape: `{ breakpoints: { [device]: { fieldKey: value } } }` to the
 * dock's `handlePresentationDeepPatch`, which merges preserving siblings.
 *
 * Why Segmented chips and Swatch instead of `<select>`:
 *   The previous select-only build collapsed the inheritance signal — you
 *   had to mentally compare the desktop dropdown with the tablet dropdown
 *   to know whether you'd overridden anything. The chip row puts both
 *   states on screen at once.
 */

import {
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
  BREAKPOINT_LABELS,
} from "@/lib/site-admin/sections/shared/presentation";

import type { ReactElement } from "react";

import { useEditContext, type EditDevice } from "../edit-context";
import { Segmented, type SegmentedOption } from "../kit/segmented";
import { Swatch } from "../kit/swatch";
import { CHROME } from "../kit/tokens";

const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";
const FIELD_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.10em] text-zinc-500";
const HINT = "text-[10.5px] leading-snug text-zinc-500";
const INHERIT_HINT = "text-[10.5px] text-zinc-400";

// Mirror Style panel swatches so background overrides are visually
// consistent across tabs.
const BACKGROUND_SWATCHES: Record<string, string> = {
  canvas:
    "linear-gradient(135deg, #ffffff 0%, #f4efe6 50%, #ffffff 100%)",
  ivory: "#fbf7ee",
  champagne: "#ecdcb8",
  espresso: "#2a201a",
  blush: "#f3d7d2",
  sage: "#c5d2bd",
  "muted-surface": "#ebe6dc",
};

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
};

type OverrideKey =
  | "containerWidth"
  | "paddingTop"
  | "paddingBottom"
  | "align"
  | "background"
  | "dividerTop";

const OVERRIDE_KEYS: ReadonlyArray<OverrideKey> = [
  "containerWidth",
  "paddingTop",
  "paddingBottom",
  "align",
  "background",
  "dividerTop",
];

// Icons reused across tabs for align affordances. Kept inline (rather than
// extracted to kit) because each panel currently picks its own glyph set.
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

const ALIGN_ICONS: Record<string, () => ReactElement> = {
  left: AlignLeftIcon,
  center: AlignCenterIcon,
  right: AlignRightIcon,
};

interface ResponsivePanelProps {
  presentation: Record<string, unknown>;
  onDeepPatch: (patch: Record<string, unknown>) => void;
}

export function ResponsivePanel({
  presentation,
  onDeepPatch,
}: ResponsivePanelProps) {
  const { device, setDevice } = useEditContext();

  const breakpoints =
    (presentation.breakpoints as
      | { tablet?: Record<string, unknown>; mobile?: Record<string, unknown> }
      | undefined) ?? {};

  const isDesktop = device === "desktop";
  const overrideObject =
    device === "tablet"
      ? (breakpoints.tablet ?? {})
      : device === "mobile"
        ? (breakpoints.mobile ?? {})
        : ({} as Record<string, unknown>);

  const desktopVal = (k: OverrideKey): string =>
    (presentation[k] as string | undefined) ?? "";
  const overrideVal = (k: OverrideKey): string =>
    (overrideObject[k] as string | undefined) ?? "";

  /**
   * Toggle pattern: clicking the active override clears it back to
   * inherit (= undefined). Editing on Desktop is disallowed — desktop
   * IS the base, so it routes through the Layout tab instead.
   */
  function setOrToggle(k: OverrideKey, next: string) {
    if (isDesktop) return;
    const current = overrideVal(k);
    onDeepPatch({
      breakpoints: {
        [device]: { [k]: current === next ? undefined : next },
      },
    });
  }

  function shortLabel(k: OverrideKey, value: string): string {
    return (
      SHORT_LABELS[k]?.[value] ??
      PRESENTATION_OPTIONS[k].find((o) => o.value === value)?.label ??
      value
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BreakpointSwitcher value={device} onChange={setDevice} />

      {isDesktop ? (
        <div
          className="rounded-md px-3 py-2.5 text-[11px] leading-relaxed"
          style={{
            background: CHROME.surface2,
            border: `1px solid ${CHROME.line}`,
            color: CHROME.muted,
          }}
        >
          Desktop is the base. Switch to <strong>Tablet</strong> or{" "}
          <strong>Mobile</strong> above to layer overrides on top — unset
          fields inherit from this base.
        </div>
      ) : (
        <div
          className="rounded-md px-3 py-2 text-[11px] leading-relaxed"
          style={{
            background: CHROME.blueBg,
            border: `1px solid ${CHROME.blueLine}`,
            color: CHROME.blue,
          }}
        >
          Editing <strong>{BREAKPOINT_LABELS[device]}</strong> overrides.
          Filled chips are this breakpoint; the small dot above a chip marks
          the desktop base.
        </div>
      )}

      <section className="flex flex-col gap-4">
        <div className={SECTION_TITLE}>
          {BREAKPOINT_LABELS[device]} overrides
        </div>

        {OVERRIDE_KEYS.map((k) => {
          const overrideValue = overrideVal(k);
          const desktop = desktopVal(k);

          // Background gets a swatch row; align gets icon chips; everything
          // else uses labelled chip pills.
          if (k === "background") {
            return (
              <div key={k} className="flex flex-col gap-1.5">
                <FieldHeader
                  label={PRESENTATION_FIELD_LABELS[k]}
                  override={overrideValue}
                  inherited={desktop}
                  shortLabelFn={(v) =>
                    PRESENTATION_OPTIONS[k].find((o) => o.value === v)
                      ?.label ?? v
                  }
                />
                <div
                  className="grid items-center gap-2.5"
                  style={{
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    opacity: isDesktop ? 0.5 : 1,
                  }}
                >
                  {PRESENTATION_OPTIONS.background.map((opt) => (
                    <SwatchWithDesktopDot
                      key={opt.value}
                      value={opt.value}
                      color={BACKGROUND_SWATCHES[opt.value] ?? "#ffffff"}
                      active={overrideValue === opt.value}
                      isDesktopBase={desktop === opt.value}
                      onClick={() => setOrToggle(k, opt.value)}
                      title={opt.label}
                      disabled={isDesktop}
                    />
                  ))}
                </div>
              </div>
            );
          }

          if (k === "align") {
            return (
              <div key={k} className="flex flex-col gap-1.5">
                <FieldHeader
                  label={PRESENTATION_FIELD_LABELS[k]}
                  override={overrideValue}
                  inherited={desktop}
                  shortLabelFn={(v) => shortLabel(k, v)}
                />
                <div
                  style={{ opacity: isDesktop ? 0.5 : 1 }}
                  className="flex items-center"
                >
                  <ChipRowWithDesktopDot
                    value={overrideValue}
                    onChange={(v) => setOrToggle(k, v)}
                    desktop={desktop}
                    options={PRESENTATION_OPTIONS[k].map((o) => {
                      const Icon = ALIGN_ICONS[o.value];
                      return {
                        value: o.value,
                        label: Icon ? <Icon /> : shortLabel(k, o.value),
                      };
                    })}
                    disabled={isDesktop}
                  />
                </div>
              </div>
            );
          }

          // dividerTop, containerWidth, paddingTop, paddingBottom — chip pill row.
          return (
            <div key={k} className="flex flex-col gap-1.5">
              <FieldHeader
                label={PRESENTATION_FIELD_LABELS[k]}
                override={overrideValue}
                inherited={desktop}
                shortLabelFn={(v) => shortLabel(k, v)}
              />
              <div style={{ opacity: isDesktop ? 0.5 : 1 }}>
                <ChipRowWithDesktopDot
                  fullWidth
                  value={overrideValue}
                  onChange={(v) => setOrToggle(k, v)}
                  desktop={desktop}
                  options={PRESENTATION_OPTIONS[k].map((o) => ({
                    value: o.value,
                    label: shortLabel(k, o.value),
                  }))}
                  disabled={isDesktop}
                />
              </div>
            </div>
          );
        })}
      </section>

      <p className={HINT}>
        Tablet overrides take effect at viewports up to 1023px. Mobile at
        640px. Anything left on inherit falls through to the desktop base
        above the breakpoint.
      </p>
    </div>
  );
}

function FieldHeader({
  label,
  override,
  inherited,
  shortLabelFn,
}: {
  label: string;
  override: string;
  inherited: string;
  shortLabelFn: (value: string) => string;
}) {
  // Three states the operator needs to read at a glance:
  //   - Override + desktop differ → show "Override · Desktop is X"
  //   - Inherits desktop value     → show "Inherits · X"
  //   - Both unset                 → show "Theme default"
  let trailing: string;
  let tone = INHERIT_HINT;
  if (override && override !== inherited) {
    trailing = `Override · Desktop is ${
      inherited ? shortLabelFn(inherited) : "default"
    }`;
    tone = "text-[10.5px] font-medium text-blue-600";
  } else if (inherited) {
    trailing = `Inherits · ${shortLabelFn(inherited)}`;
  } else {
    trailing = "Theme default";
  }
  return (
    <div className="flex items-baseline justify-between">
      <span className={FIELD_LABEL}>{label}</span>
      <span className={tone}>{trailing}</span>
    </div>
  );
}

function ChipRowWithDesktopDot({
  value,
  onChange,
  desktop,
  options,
  disabled,
  fullWidth,
}: {
  value: string;
  onChange: (next: string) => void;
  desktop: string;
  options: ReadonlyArray<SegmentedOption<string>>;
  disabled: boolean;
  fullWidth?: boolean;
}) {
  // We want both a chip pill (for the override) AND a small dot above the
  // desktop-base option. Stacking via flex-col so the dot doesn't disturb
  // the chip's hit area or sizing. Dot is decorative only.
  return (
    <div className="flex flex-col gap-1" style={{ width: fullWidth ? "100%" : undefined }}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: fullWidth
            ? `repeat(${options.length}, minmax(0, 1fr))`
            : `repeat(${options.length}, auto)`,
          gap: 0,
          paddingLeft: 3,
          paddingRight: 3,
        }}
      >
        {options.map((opt) => {
          const isDesktopBase = desktop === opt.value;
          return (
            <div
              key={opt.value}
              className="flex h-2 items-center justify-center"
              aria-hidden
            >
              {isDesktopBase ? (
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: CHROME.muted2,
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ pointerEvents: disabled ? "none" : "auto" }}>
        <Segmented
          fullWidth={fullWidth}
          compact
          value={value}
          onChange={onChange}
          options={options}
        />
      </div>
    </div>
  );
}

function SwatchWithDesktopDot({
  value,
  color,
  active,
  isDesktopBase,
  onClick,
  title,
  disabled,
}: {
  value: string;
  color: string;
  active: boolean;
  isDesktopBase: boolean;
  onClick: () => void;
  title: string;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1" data-value={value}>
      <span
        aria-hidden
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: isDesktopBase ? CHROME.muted2 : "transparent",
        }}
      />
      <div style={{ pointerEvents: disabled ? "none" : "auto" }}>
        <Swatch
          color={color}
          active={active}
          onClick={onClick}
          size={26}
          title={title}
        />
      </div>
    </div>
  );
}

function BreakpointSwitcher({
  value,
  onChange,
}: {
  value: EditDevice;
  onChange: (d: EditDevice) => void;
}) {
  // Keep this one local rather than borrowing kit Segmented because it
  // also drives the live canvas device — it's a navigational control
  // (mode), not an enum picker (value).
  const items: ReadonlyArray<{ key: EditDevice; label: string }> = [
    { key: "desktop", label: BREAKPOINT_LABELS.desktop },
    { key: "tablet", label: BREAKPOINT_LABELS.tablet },
    { key: "mobile", label: BREAKPOINT_LABELS.mobile },
  ];
  return (
    <div
      className="inline-flex w-fit p-0.5"
      style={{
        background: CHROME.paper,
        border: `1px solid ${CHROME.line}`,
        borderRadius: 7,
      }}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className="rounded-[5px] px-3 py-1 text-[11px] font-semibold transition"
          style={{
            background: value === it.key ? CHROME.surface : "transparent",
            color: value === it.key ? CHROME.ink : CHROME.muted,
            boxShadow:
              value === it.key
                ? "0 1px 3px rgba(0,0,0,0.08)"
                : "none",
            border: "none",
            cursor: "pointer",
          }}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
