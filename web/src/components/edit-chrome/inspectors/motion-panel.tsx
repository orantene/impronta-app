"use client";

/**
 * MotionPanel — Phase 6 inspector tab for section-level animation.
 *
 * Reads / writes `presentation.animation`:
 *   - entry          runs once when the section enters the viewport
 *   - scroll         continuous behavior bound to scroll position
 *   - hover          applied on cursor-over the section
 *   - reducedMotion  'respect' (default) honors prefers-reduced-motion;
 *                    'always' forces animation regardless. Surfaced with
 *                    a clear accessibility warning.
 *
 * Storefront CSS gates the animation rules behind
 * `@media (prefers-reduced-motion: no-preference)` by default; the
 * "always" mode re-applies the rules in a wider scope so they fire even
 * for users who've asked the OS for reduced motion. Operators should
 * opt into "always" rarely.
 */

import {
  ANIMATION_FIELD_LABELS,
  ANIMATION_OPTIONS,
} from "@/lib/site-admin/sections/shared/presentation";

const FIELD_GROUP = "flex flex-col gap-1";
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";
const SELECT =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none";
const SECTION = "flex flex-col gap-3";
const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400";

type AnimationKey = "entry" | "scroll" | "hover" | "reducedMotion";

interface MotionPanelProps {
  presentation: Record<string, unknown>;
  onDeepPatch: (patch: Record<string, unknown>) => void;
}

export function MotionPanel({ presentation, onDeepPatch }: MotionPanelProps) {
  const animation =
    (presentation.animation as Record<string, unknown> | undefined) ?? {};

  const val = (k: AnimationKey): string =>
    (animation[k] as string | undefined) ?? "";

  function patch(k: AnimationKey, value: string) {
    onDeepPatch({ animation: { [k]: value || undefined } });
  }

  const reducedMotion = val("reducedMotion");

  return (
    <div className="flex flex-col gap-6">
      <section className={SECTION}>
        <div className={SECTION_TITLE}>Entry</div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>{ANIMATION_FIELD_LABELS.entry}</label>
          <select
            className={SELECT}
            value={val("entry")}
            onChange={(e) => patch("entry", e.target.value)}
          >
            <option value="">None</option>
            {ANIMATION_OPTIONS.entry
              .filter((o) => o.value !== "none")
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
          <div className="text-[10px] leading-relaxed text-zinc-400">
            Runs once when the section first scrolls into view.
          </div>
        </div>
      </section>

      <section className={SECTION}>
        <div className={SECTION_TITLE}>Scroll</div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>{ANIMATION_FIELD_LABELS.scroll}</label>
          <select
            className={SELECT}
            value={val("scroll")}
            onChange={(e) => patch("scroll", e.target.value)}
          >
            <option value="">None</option>
            {ANIMATION_OPTIONS.scroll
              .filter((o) => o.value !== "none")
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
          <div className="text-[10px] leading-relaxed text-zinc-400">
            Continuous behavior. Soft parallax slows the background image as
            the visitor scrolls; stagger reveal fades child items in sequence.
          </div>
        </div>
      </section>

      <section className={SECTION}>
        <div className={SECTION_TITLE}>Hover</div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>{ANIMATION_FIELD_LABELS.hover}</label>
          <select
            className={SELECT}
            value={val("hover")}
            onChange={(e) => patch("hover", e.target.value)}
          >
            <option value="">None</option>
            {ANIMATION_OPTIONS.hover
              .filter((o) => o.value !== "none")
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
          <div className="text-[10px] leading-relaxed text-zinc-400">
            Applied on cursor-over the section card. Lift = subtle translate;
            glow = accent-color shadow; tilt = perspective rotate.
          </div>
        </div>
      </section>

      <section className={SECTION}>
        <div className={SECTION_TITLE}>Accessibility</div>
        <div className={FIELD_GROUP}>
          <label className={LABEL}>
            {ANIMATION_FIELD_LABELS.reducedMotion}
          </label>
          <select
            className={SELECT}
            value={val("reducedMotion")}
            onChange={(e) => patch("reducedMotion", e.target.value)}
          >
            <option value="">Respect (default)</option>
            {ANIMATION_OPTIONS.reducedMotion
              .filter((o) => o.value !== "respect")
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
          {reducedMotion === "always" ? (
            <div
              className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-900"
            >
              <strong className="font-semibold">Heads up:</strong> visitors
              who set <em>prefers-reduced-motion: reduce</em> at the OS level
              are asking you not to animate. Use this only for animations
              that are truly content-critical.
            </div>
          ) : (
            <div className="text-[10px] leading-relaxed text-zinc-400">
              Animations run for visitors who haven&apos;t requested reduced
              motion at the OS level.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
