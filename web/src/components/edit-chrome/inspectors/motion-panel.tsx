"use client";

/**
 * MotionPanel — section-level animation controls.
 *
 * Implements builder-experience.html surface §5 (Inspector Motion tab).
 * Last reconciled: 2026-04-25.
 *
 * Reads / writes `presentation.animation`:
 *   - entry          runs once when the section enters the viewport
 *   - scroll         continuous behavior bound to scroll position
 *   - hover          applied on cursor-over the section
 *   - reducedMotion  'respect' (default) honors prefers-reduced-motion;
 *                    'always' forces animation regardless. Surfaced with
 *                    a clear accessibility warning.
 *
 * The previous select-only build (Phase B.4 inspector pass — "1995 website"
 * operator feedback, 2026-04-25) collapsed the entire motion vocabulary
 * into a dropdown. Here we use Segmented chip rows with iconographic glyphs
 * so the operator can see all entry directions at once and pick by sight.
 *
 * Toggle-to-clear: clicking the active chip clears it back to undefined
 * (= no animation). The reducedMotion field is the exception — its base
 * state has explicit copy ("Respect") rather than an unset chip, because
 * accessibility defaults should be visible, not implicit.
 *
 * Storefront CSS gates the animation rules behind
 * `@media (prefers-reduced-motion: no-preference)` by default; the
 * "always" mode re-applies them in a wider scope so they fire even for
 * users who've asked the OS for reduced motion. Operators should opt in
 * rarely.
 */

import {
  ANIMATION_OPTIONS,
} from "@/lib/site-admin/sections/shared/presentation";

import { useEffect, useRef, useState, type ReactElement } from "react";

import { useEditContext } from "../edit-context";
import { Segmented, type SegmentedOption } from "../kit/segmented";
import {
  INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL,
  INSPECTOR_HELP_TEXT_CLASS as HINT,
  InspectorBody,
  InspectorNotice,
  InspectorOptionCards,
  InspectorSection,
} from "./kit/inspector-ui";

/**
 * Debounced range slider.
 *
 * QA 2026-05-13 — the bare `<input type="range">` used to fire
 * `onCommit` on every tick (every step), which hit the server's
 * presentation-patch action per-step — dragging the slider hammered
 * the API with dozens of calls per second. Now we hold the value in
 * local state for smooth visual feedback and only commit after the
 * operator settles (200ms timer that resets on each tick + commits on
 * `pointerup` / `keyup` / `blur` as a belt-and-suspenders).
 */
function DebouncedRangeInput({
  min,
  max,
  step,
  value,
  onCommit,
  ariaLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onCommit: (next: number) => void;
  ariaLabel?: string;
}) {
  const [local, setLocal] = useState(value);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep local mirror in sync when the server value changes from outside
  // (undo, reset, sibling field). Doesn't fight ongoing drags because
  // the parent doesn't re-render mid-drag unless onCommit fires.
  useEffect(() => {
    setLocal(value);
  }, [value]);
  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);
  function scheduleCommit(next: number) {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => onCommit(next), 200);
  }
  function commitNow(next: number) {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    onCommit(next);
  }
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={local}
      aria-label={ariaLabel}
      onChange={(e) => {
        const next = Number(e.target.value);
        setLocal(next);
        scheduleCommit(next);
      }}
      onPointerUp={() => commitNow(local)}
      onKeyUp={() => commitNow(local)}
      onBlur={() => commitNow(local)}
    />
  );
}

type AnimationKey = "entry" | "scroll" | "hover" | "reducedMotion";

// Iconographic glyphs for entry directions. Each is a small box + an arrow
// indicating the trajectory. Reads faster than copy.
const FadeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect
      x="5"
      y="5"
      width="14"
      height="14"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.6"
      opacity="0.45"
    />
  </svg>
);
const FadeUpIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="5" y="3" width="14" height="14" rx="2" opacity="0.45" />
    <path d="M12 22 V 18" />
    <path d="M9 21 L 12 18 L 15 21" />
  </svg>
);
const FadeDownIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="5" y="7" width="14" height="14" rx="2" opacity="0.45" />
    <path d="M12 2 V 6" />
    <path d="M9 3 L 12 6 L 15 3" />
  </svg>
);
const SlideLeftIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="3" y="5" width="14" height="14" rx="2" opacity="0.45" />
    <path d="M22 12 H 18" />
    <path d="M21 9 L 18 12 L 21 15" />
  </svg>
);
const SlideRightIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="7" y="5" width="14" height="14" rx="2" opacity="0.45" />
    <path d="M2 12 H 6" />
    <path d="M3 9 L 6 12 L 3 15" />
  </svg>
);
const ScaleInIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <rect x="3" y="3" width="18" height="18" rx="2" opacity="0.35" />
  </svg>
);
const NoneIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" opacity="0.45" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ParallaxIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <path d="M3 9 L 21 7" opacity="0.35" />
    <path d="M3 14 L 21 12" />
    <path d="M3 19 L 21 17" opacity="0.6" />
  </svg>
);
const StaggerIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="3" y="4" width="6" height="6" rx="1" opacity="0.35" />
    <rect x="11" y="4" width="6" height="6" rx="1" opacity="0.6" />
    <rect x="3" y="14" width="6" height="6" rx="1" opacity="0.85" />
    <rect x="11" y="14" width="6" height="6" rx="1" />
  </svg>
);

const LiftIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <rect x="5" y="6" width="14" height="10" rx="2" />
    <path d="M5 20 H 19" opacity="0.5" />
  </svg>
);
const GlowIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3 V 5" />
    <path d="M12 19 V 21" />
    <path d="M3 12 H 5" />
    <path d="M19 12 H 21" />
    <path d="M5.5 5.5 L 7 7" />
    <path d="M17 17 L 18.5 18.5" />
    <path d="M5.5 18.5 L 7 17" />
    <path d="M17 7 L 18.5 5.5" />
  </svg>
);
const TiltIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    strokeLinejoin="round">
    <path d="M5 7 L 19 5 L 19 17 L 5 19 Z" />
  </svg>
);

const ENTRY_ICONS: Record<string, () => ReactElement> = {
  none: NoneIcon,
  fade: FadeIcon,
  "fade-up": FadeUpIcon,
  "fade-down": FadeDownIcon,
  "slide-left": SlideLeftIcon,
  "slide-right": SlideRightIcon,
  "scale-in": ScaleInIcon,
};

const SCROLL_ICONS: Record<string, () => ReactElement> = {
  none: NoneIcon,
  "parallax-soft": ParallaxIcon,
  "reveal-stagger": StaggerIcon,
};

const HOVER_ICONS: Record<string, () => ReactElement> = {
  none: NoneIcon,
  lift: LiftIcon,
  glow: GlowIcon,
  tilt: TiltIcon,
};

interface MotionPanelProps {
  presentation: Record<string, unknown>;
  onDeepPatch: (patch: Record<string, unknown>) => void;
}

export function MotionPanel({ presentation, onDeepPatch }: MotionPanelProps) {
  const { device } = useEditContext();
  const nonDesktop = device !== "desktop";
  const animation =
    (presentation.animation as Record<string, unknown> | undefined) ?? {};

  const val = (k: AnimationKey): string =>
    (animation[k] as string | undefined) ?? "";

  /**
   * Toggle pattern: clicking the active chip clears the field. "none" is
   * a real schema value (explicit "no animation, even if theme suggests
   * one") so we keep it selectable separately from the inherit/unset state.
   */
  function setOrToggle(k: AnimationKey, next: string) {
    const current = val(k);
    onDeepPatch({
      animation: { [k]: current === next ? undefined : next },
    });
  }

  const entryValue = val("entry");
  const scrollValue = val("scroll");
  const hoverValue = val("hover");
  const reducedMotion = val("reducedMotion");

  function buildIconOptions(
    options: ReadonlyArray<{ value: string; label: string }>,
    icons: Record<string, () => ReactElement>,
  ): ReadonlyArray<SegmentedOption<string>> {
    return options.map((o) => {
      const Icon = icons[o.value];
      return {
        value: o.value,
        label: Icon ? <Icon /> : o.label,
      };
    });
  }

  function describe(
    options: ReadonlyArray<{ value: string; label: string }>,
    value: string,
  ): string | null {
    if (!value) return null;
    return options.find((o) => o.value === value)?.label ?? value;
  }

  return (
    <InspectorBody>
      {nonDesktop ? (
        <InspectorNotice tone="info">
          Uses desktop motion on {device === "tablet" ? "Tablet" : "Mobile"}. Switch to Desktop to edit entrance, scroll, and hover effects. Hide on this device is in the viewport rail above.
        </InspectorNotice>
      ) : null}
      <div style={{ opacity: nonDesktop ? 0.55 : 1, pointerEvents: nonDesktop ? "none" : "auto" }}>
      <InspectorSection
        title="Entrance animation"
        description={
          describe(ANIMATION_OPTIONS.entry, entryValue) ??
          "Runs once when the section first scrolls into view."
        }
      >
        <InspectorOptionCards
          value={entryValue || undefined}
          onChange={(next) => setOrToggle("entry", next ?? "")}
          columns={5}
          options={ANIMATION_OPTIONS.entry.map((o) => {
            const Icon = ENTRY_ICONS[o.value];
            return {
              value: o.value,
              label: o.label,
              icon: Icon ? <Icon /> : undefined,
            };
          })}
        />
      </InspectorSection>

      <InspectorSection
        title="Scroll behavior"
        description={
          scrollValue === "parallax-soft"
            ? "Soft parallax slows the background image as the visitor scrolls."
            : scrollValue === "reveal-stagger"
              ? "Stagger reveal fades child items in sequence as they enter view."
              : "Continuous behavior bound to scroll position. Off by default."
        }
      >
        <Segmented
          fullWidth
          compact
          value={scrollValue}
          onChange={(next) => setOrToggle("scroll", next)}
          options={buildIconOptions(ANIMATION_OPTIONS.scroll, SCROLL_ICONS)}
        />
      </InspectorSection>

      <InspectorSection title="Hover">
        <Segmented
          fullWidth
          compact
          value={hoverValue}
          onChange={(next) => setOrToggle("hover", next)}
          options={buildIconOptions(ANIMATION_OPTIONS.hover, HOVER_ICONS)}
        />
        <span className={HINT}>
          {hoverValue === "lift"
            ? "Subtle translate upward on cursor-over."
            : hoverValue === "glow"
              ? "Accent-color shadow blooms outward."
              : hoverValue === "tilt"
                ? "Perspective rotate following the cursor."
                : "Applied on cursor-over the section card. Off by default."}
        </span>
      </InspectorSection>

      <InspectorSection title="Reduced motion">
        <Segmented
          fullWidth
          compact
          value={reducedMotion || "respect"}
          onChange={(next) => {
            onDeepPatch({
              animation: {
                reducedMotion: next === "respect" ? undefined : next,
              },
            });
          }}
          options={[
            { value: "respect", label: "Respect" },
            { value: "always", label: "Force animate" },
          ]}
        />
        {reducedMotion === "always" ? (
          <InspectorNotice tone="info">
            <strong className="font-semibold">Heads up:</strong> visitors who set{" "}
            <em>prefers-reduced-motion: reduce</em> at the OS level are asking you not
            to animate. Use this only for animation that is truly content-critical.
          </InspectorNotice>
        ) : (
          <InspectorNotice>
            Animations will respect users&apos; reduced motion preferences for
            accessibility.
          </InspectorNotice>
        )}
      </InspectorSection>

      <InspectorSection title="Scroll reveal">
        <Segmented
          fullWidth
          compact
          value={(presentation.scrollReveal as string) ?? "none"}
          onChange={(next) =>
            onDeepPatch({ scrollReveal: next === "none" ? undefined : next })
          }
          options={[
            { value: "none", label: "None" },
            { value: "fade", label: "Fade" },
            { value: "fade-up", label: "Up" },
            { value: "fade-down", label: "Down" },
            { value: "fade-left", label: "Left" },
            { value: "fade-right", label: "Right" },
            { value: "zoom", label: "Zoom" },
          ]}
        />
        <span className={HINT}>
          Plays once when the section enters the viewport. Skipped when the
          visitor prefers reduced motion.
        </span>
        {presentation.scrollReveal && presentation.scrollReveal !== "none" ? (
          <div className="flex flex-col gap-2">
            <span className={FIELD_LABEL}>
              Reveal delay (
              {(presentation.scrollRevealDelay as number | undefined) ?? 0}ms)
            </span>
            <DebouncedRangeInput
              min={0}
              max={1500}
              step={50}
              value={
                (presentation.scrollRevealDelay as number | undefined) ?? 0
              }
              ariaLabel="Reveal delay in milliseconds"
              onCommit={(next) =>
                onDeepPatch({
                  scrollRevealDelay: next || undefined,
                })
              }
            />
          </div>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Parallax">
        <DebouncedRangeInput
          min={0}
          max={1}
          step={0.05}
          value={(presentation.parallaxIntensity as number | undefined) ?? 0}
          ariaLabel="Parallax intensity"
          onCommit={(next) =>
            onDeepPatch({
              parallaxIntensity: next || undefined,
            })
          }
        />
        <span className={HINT}>
          Section translates ±60px relative to scroll. Falls back to no motion in
          browsers without scroll-driven animation support, and for visitors who
          prefer reduced motion.
        </span>
      </InspectorSection>
      </div>
    </InspectorBody>
  );
}
