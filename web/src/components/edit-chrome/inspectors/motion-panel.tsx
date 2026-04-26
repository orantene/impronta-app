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
  ANIMATION_FIELD_LABELS,
  ANIMATION_OPTIONS,
} from "@/lib/site-admin/sections/shared/presentation";

import type { ReactElement } from "react";

import { Segmented, type SegmentedOption } from "../kit/segmented";
import { CHROME } from "../kit/tokens";

const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";
const FIELD_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.10em] text-zinc-500";
const HINT = "text-[10.5px] leading-snug text-zinc-500";
const INHERIT_HINT = "text-[10.5px] text-zinc-400";

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
    <div className="flex flex-col gap-6">
      {/* ── Entry ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Entry</div>
          {!entryValue ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className={FIELD_LABEL}>{ANIMATION_FIELD_LABELS.entry}</span>
          <Segmented
            fullWidth
            compact
            value={entryValue}
            onChange={(next) => setOrToggle("entry", next)}
            options={buildIconOptions(ANIMATION_OPTIONS.entry, ENTRY_ICONS)}
          />
          <span className={HINT}>
            {describe(ANIMATION_OPTIONS.entry, entryValue) ??
              "Runs once when the section first scrolls into view."}
          </span>
        </div>
      </section>

      {/* ── Scroll ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Scroll</div>
          {!scrollValue ? (
            <span className={INHERIT_HINT}>None</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className={FIELD_LABEL}>{ANIMATION_FIELD_LABELS.scroll}</span>
          <Segmented
            fullWidth
            compact
            value={scrollValue}
            onChange={(next) => setOrToggle("scroll", next)}
            options={buildIconOptions(
              ANIMATION_OPTIONS.scroll,
              SCROLL_ICONS,
            )}
          />
          <span className={HINT}>
            {scrollValue === "parallax-soft"
              ? "Soft parallax slows the background image as the visitor scrolls."
              : scrollValue === "reveal-stagger"
                ? "Stagger reveal fades child items in sequence as they enter view."
                : "Continuous behavior bound to scroll position. Off by default."}
          </span>
        </div>
      </section>

      {/* ── Hover ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Hover</div>
          {!hoverValue ? (
            <span className={INHERIT_HINT}>None</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className={FIELD_LABEL}>{ANIMATION_FIELD_LABELS.hover}</span>
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
        </div>
      </section>

      {/* ── Accessibility ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className={SECTION_TITLE}>Accessibility</div>
        <div className="flex flex-col gap-2">
          <span className={FIELD_LABEL}>
            {ANIMATION_FIELD_LABELS.reducedMotion}
          </span>
          {/* Two-state Segmented: explicit "Respect" rather than an unset
              chip, because accessibility defaults should be visible. The
              unset state and "respect" map to identical behavior — we
              normalize to undefined when the operator picks Respect so we
              don't bloat the saved JSON. */}
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
            <div
              className="rounded-md px-2.5 py-1.5 text-[11px] leading-relaxed"
              style={{
                background: CHROME.amberBg,
                border: `1px solid ${CHROME.amberLine}`,
                color: CHROME.amber,
              }}
            >
              <strong className="font-semibold">Heads up:</strong> visitors
              who set <em>prefers-reduced-motion: reduce</em> at the OS level
              are asking you not to animate. Use this only for animation
              that is truly content-critical.
            </div>
          ) : (
            <span className={HINT}>
              Animations run for visitors who haven&apos;t asked the OS for
              reduced motion. Recommended.
            </span>
          )}
        </div>
      </section>

      {/* ── Phase 5: scroll-reveal + parallax ─────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Scroll reveal</div>
          {!presentation.scrollReveal ? (
            <span className={INHERIT_HINT}>None</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className={FIELD_LABEL}>Entry direction (one-shot)</span>
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
        </div>
        {presentation.scrollReveal && presentation.scrollReveal !== "none" ? (
          <div className="flex flex-col gap-2">
            <span className={FIELD_LABEL}>
              Reveal delay (
              {(presentation.scrollRevealDelay as number | undefined) ?? 0}ms)
            </span>
            <input
              type="range"
              min={0}
              max={1500}
              step={50}
              value={
                (presentation.scrollRevealDelay as number | undefined) ?? 0
              }
              onChange={(e) =>
                onDeepPatch({
                  scrollRevealDelay: Number(e.target.value) || undefined,
                })
              }
            />
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Parallax</div>
          {!presentation.parallaxIntensity ? (
            <span className={INHERIT_HINT}>Off</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className={FIELD_LABEL}>
            Intensity (
            {Math.round(
              ((presentation.parallaxIntensity as number | undefined) ?? 0) *
                100,
            )}
            %)
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={(presentation.parallaxIntensity as number | undefined) ?? 0}
            onChange={(e) =>
              onDeepPatch({
                parallaxIntensity: Number(e.target.value) || undefined,
              })
            }
          />
          <span className={HINT}>
            Section translates ±60px relative to scroll. Falls back to no
            motion in browsers without scroll-driven animation support, and
            for visitors who prefer reduced motion.
          </span>
        </div>
      </section>
    </div>
  );
}
