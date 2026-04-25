"use client";

/**
 * ResponsivePanel — Phase 6 inspector tab for per-viewport overrides.
 *
 * Reads `presentation.breakpoints.{tablet,mobile}` on the section draft and
 * exposes the same six layout fields (background / paddingTop / paddingBottom
 * / containerWidth / align / dividerTop) per breakpoint. The active breakpoint
 * follows the topbar's device switcher (`useEditContext().device`), so the
 * canvas preview and the inspector stay in lockstep.
 *
 * Override inheritance: an unset tablet/mobile field falls through to the
 * desktop base (rendered in the helper text below each select). Storefront
 * CSS already handles the cascade — see `Phase 6` block in token-presets.css.
 *
 * Patch shape: emits `{ breakpoints: { [activeBreakpoint]: { fieldKey: value } } }`
 * to the dock's `handlePresentationDeepPatch`, which merges into the
 * presentation object preserving siblings.
 */

import { useEditContext, type EditDevice } from "../edit-context";
import {
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
  BREAKPOINT_LABELS,
} from "@/lib/site-admin/sections/shared/presentation";

const FIELD_GROUP = "flex flex-col gap-1";
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";
const SELECT =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none";
const HELPER = "text-[10px] text-zinc-400";
const SECTION = "flex flex-col gap-3";
const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400";

type OverrideKey =
  | "background"
  | "paddingTop"
  | "paddingBottom"
  | "containerWidth"
  | "align"
  | "dividerTop";

const OVERRIDE_KEYS: ReadonlyArray<OverrideKey> = [
  "containerWidth",
  "paddingTop",
  "paddingBottom",
  "align",
  "background",
  "dividerTop",
];

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

  // Desktop is the inherited base — its fields live at the top level of the
  // presentation object (Layout tab edits those). The Responsive tab edits
  // tablet/mobile overrides only, but still surfaces the desktop base value
  // as the inheritance hint.
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

  function patch(k: OverrideKey, value: string) {
    if (isDesktop) return; // desktop edits route through the Layout tab.
    onDeepPatch({
      breakpoints: {
        [device]: { [k]: value || undefined },
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <BreakpointSwitcher value={device} onChange={setDevice} />

      {isDesktop ? (
        <div
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-600"
        >
          Desktop is the base. Switch to Tablet or Mobile above to layer
          overrides on top — unset fields inherit from this base.
        </div>
      ) : null}

      <section className={SECTION}>
        <div className={SECTION_TITLE}>
          {BREAKPOINT_LABELS[device]} overrides
        </div>

        {OVERRIDE_KEYS.map((k) => (
          <OverrideField
            key={k}
            label={PRESENTATION_FIELD_LABELS[k]}
            value={overrideVal(k)}
            inheritedFrom={desktopVal(k)}
            options={
              PRESENTATION_OPTIONS[k] as ReadonlyArray<{
                value: string;
                label: string;
              }>
            }
            disabled={isDesktop}
            onChange={(v) => patch(k, v)}
          />
        ))}
      </section>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Tablet overrides take effect at viewports up to 1023px. Mobile at
        640px. Anything you leave on <em>Inherit</em> falls through to the
        desktop base above the breakpoint.
      </p>
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
  const items: ReadonlyArray<{ key: EditDevice; label: string }> = [
    { key: "desktop", label: BREAKPOINT_LABELS.desktop },
    { key: "tablet", label: BREAKPOINT_LABELS.tablet },
    { key: "mobile", label: BREAKPOINT_LABELS.mobile },
  ];
  return (
    <div className="inline-flex w-fit rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className={
            "rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition " +
            (value === it.key
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-800")
          }
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function OverrideField({
  label,
  value,
  inheritedFrom,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  inheritedFrom: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const inheritedLabel =
    options.find((o) => o.value === inheritedFrom)?.label ?? "Theme default";
  return (
    <div className={FIELD_GROUP}>
      <label className={LABEL}>{label}</label>
      <select
        className={SELECT}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ opacity: disabled ? 0.55 : 1 }}
      >
        <option value="">Inherit · {inheritedLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {value && value !== inheritedFrom ? (
        <div className={HELPER}>
          ↳ Override · Desktop is{" "}
          <em>
            {inheritedFrom
              ? (options.find((o) => o.value === inheritedFrom)?.label ?? inheritedFrom)
              : "theme default"}
          </em>
        </div>
      ) : null}
    </div>
  );
}
