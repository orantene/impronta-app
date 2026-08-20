"use client";

/**
 * AnimationPanel — the inspector's Animation tab for standalone builder nodes.
 *
 * Replaces the old NodeMotionPanel (a 10-chip icon row plus raw CSS-time text
 * inputs) and the Style tab's "Entrance animation" fold, which offered the same
 * keys a third time in a different vocabulary. One surface now owns entrance
 * motion: pick a preset from a gallery that PLAYS each option on hover, then
 * tune it in plain language.
 *
 * WHAT THIS WRITES
 * ────────────────
 * The existing style keys, unchanged: `animationPreset`, `animationDuration`,
 * `animationDelay`, `animationTrigger`, `animationEasing`,
 * `animationEasingCustom`, plus the two the Animation tab added
 * (`animationDistance`, `animationRepeat`). The renderer is the same renderer.
 *
 * BASE LANE ONLY -- animation keys have NO responsive lane. There is no such
 * thing as a tablet-only entrance animation in this engine, so the panel never
 * offers one and says so when a non-desktop viewport is active. Writing these
 * keys into `responsive.tablet` would persist fine and render nothing, which is
 * exactly the failure this panel exists to stop repeating.
 *
 * REDUCED MOTION always wins. Every lane in the renderer is guarded by
 * `prefers-reduced-motion: reduce`; the footnote at the bottom of the panel
 * says so rather than leaving the operator to discover it.
 *
 * Scroll REVEAL (the separate `revealOnView` transition system), PARALLAX and
 * HOVER STATE STYLE are deliberately NOT here: they are not entrance
 * animation, and they still live on the Style tab where they always did.
 */

import { useRef, type ReactNode } from "react";

import {
  BUILDER_ANIMATION_DEFAULT_DELAY,
  BUILDER_ANIMATION_DEFAULT_DURATION,
  BUILDER_ANIMATION_PRESET_BY_VALUE,
  BUILDER_ANIMATION_SPEED_PRESETS,
  builderAnimationPresetTravels,
  type BuilderAnimationPreset,
  type BuilderAnimationRepeat,
  type BuilderAnimationTrigger,
} from "@/lib/site-admin/builder-node/animation-presets";
import type {
  BuilderNode,
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node";
import { useEditContext } from "../edit-context";
import { Segmented } from "../kit/segmented";
import { CHROME } from "../kit/tokens";
import { AnimationGallery } from "./animation-gallery";
import {
  INSPECTOR_HELP_TEXT_CLASS as HINT,
  InspectorBody,
  InspectorField,
  InspectorNotice,
  InspectorSection,
} from "./kit/inspector-ui";
import { triggerAnimationReplay } from "./kit/motion-animation-replay";

type AnimationEasing = NonNullable<BuilderNodeStyleValue["animationEasing"]>;

/**
 * Easing, in words. The cubic-bezier behind each lives in the renderer
 * (`resolveAnimationEasing`); nobody choosing "Gentle" needs to know that it is
 * `cubic-bezier(0.4, 0, 0.2, 1)`. The raw curve is still reachable -- it is the
 * `animationEasingCustom` key, which the Style tab's advanced field owns.
 */
const EASING_OPTIONS: ReadonlyArray<{ value: AnimationEasing; label: string }> = [
  { value: "ease-out", label: "Natural" },
  { value: "smooth", label: "Gentle" },
  { value: "back", label: "Playful" },
  { value: "linear", label: "Even" },
];

/** The friendly default when an operator has never touched easing. */
const DEFAULT_EASING: AnimationEasing = "ease-out";

/** Delay chips, in CSS time. A slider would be false precision here. */
const DELAY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "0s", label: "None" },
  { value: "0.15s", label: "Short" },
  { value: "0.3s", label: "Medium" },
  { value: "0.6s", label: "Long" },
];

/** Parse a CSS time ("0.6s", "400ms") to milliseconds. NaN-safe. */
function cssTimeToMs(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const trimmed = value.trim();
  const ms = /^(-?[\d.]+)ms$/.exec(trimmed);
  if (ms) {
    const n = Number(ms[1]);
    return Number.isFinite(n) ? n : fallback;
  }
  const s = /^(-?[\d.]+)s$/.exec(trimmed);
  if (s) {
    const n = Number(s[1]);
    return Number.isFinite(n) ? n * 1000 : fallback;
  }
  return fallback;
}

/** Render milliseconds back as the short CSS time the style keys store. */
function msToCssTime(ms: number): string {
  const seconds = Math.round(ms) / 1000;
  return `${Number(seconds.toFixed(2))}s`;
}

/** Parse the numeric part of a CSS pixel length. */
function pxToNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const m = /^(-?[\d.]+)px$/.exec(value.trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : fallback;
}

function FieldRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

export interface AnimationPanelProps {
  node: Exclude<BuilderNode, { kind: "section" }>;
  onPatchNodeProps: (nodeId: string, patch: Record<string, unknown>) => Promise<void>;
}

export function AnimationPanel({ node, onPatchNodeProps }: AnimationPanelProps) {
  const { device } = useEditContext();
  const nonDesktop = device !== "desktop";

  // Serialise async patches so rapid clicks in the gallery cannot race.
  const patchChainRef = useRef<Promise<void>>(Promise.resolve());

  const style = (node.props as { style?: BuilderNodeStyle }).style;

  /**
   * Merge an animation patch into the node's BASE style. Keys passed as
   * `undefined` are DELETED rather than spread (spreading undefined leaves the
   * old value in place), so "turn this off" actually removes the key instead of
   * leaving a ghost prop on the node.
   */
  function patchAnimation(patch: Partial<BuilderNodeStyleValue>) {
    const next: BuilderNodeStyle = { ...style };
    for (const key of Object.keys(patch) as Array<keyof BuilderNodeStyleValue>) {
      const value = patch[key];
      if (value === undefined || value === null || value === "") {
        delete (next as Record<string, unknown>)[key];
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
    }
    patchChainRef.current = patchChainRef.current
      .catch(() => {
        /* keep the chain alive after a failed patch */
      })
      .then(async () => {
        await onPatchNodeProps(node.id, { style: next });
      });
  }

  const preset = (style?.animationPreset ?? "none") as BuilderAnimationPreset;
  const spec = BUILDER_ANIMATION_PRESET_BY_VALUE[preset];
  const on = preset !== "none";
  const trigger = (style?.animationTrigger ?? "load") as BuilderAnimationTrigger;
  const repeat = (style?.animationRepeat ?? "every") as BuilderAnimationRepeat;
  const easing = (style?.animationEasing ?? DEFAULT_EASING) as AnimationEasing;
  const durationMs = cssTimeToMs(
    style?.animationDuration,
    cssTimeToMs(BUILDER_ANIMATION_DEFAULT_DURATION, 600),
  );
  const delay = style?.animationDelay ?? BUILDER_ANIMATION_DEFAULT_DELAY;
  const travels = builderAnimationPresetTravels(preset);
  const distancePx = pxToNumber(
    style?.animationDistance,
    pxToNumber(spec?.defaultDistance ?? undefined, 24),
  );

  /**
   * Apply a preset and replay it once on the canvas so the choice is visible
   * where the operator is looking. Published pages are untouched by this: the
   * replay is an editor-side restart of the same CSS animation.
   */
  function selectPreset(next: BuilderAnimationPreset) {
    if (next === "none") {
      patchAnimation({
        animationPreset: undefined,
        animationTrigger: undefined,
        animationRepeat: undefined,
        animationDuration: undefined,
        animationDelay: undefined,
        animationDistance: undefined,
        animationEasing: undefined,
      });
      return;
    }
    patchAnimation({ animationPreset: next });
    // One frame after the patch lands the canvas has the new keyframe name.
    window.setTimeout(() => triggerAnimationReplay(null, node.id), 60);
  }

  return (
    <InspectorBody>
      {nonDesktop ? (
        <InspectorNotice tone="info">
          Animation is one setting for every screen size. You can edit it from
          any viewport and it applies everywhere.
        </InspectorNotice>
      ) : null}

      <InspectorSection
        title="Animation"
        description="How this element arrives on the page. Hover a card to watch it play, then click to apply."
      >
        <AnimationGallery value={preset} onSelect={selectPreset} />
        {on ? (
          <div className="flex items-center justify-between gap-2">
            <span className={HINT}>{spec?.description ?? ""}</span>
            <button
              type="button"
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium"
              style={{
                border: `1px solid ${CHROME.lineStrong}`,
                background: CHROME.surface,
                color: CHROME.text,
              }}
              onClick={() => triggerAnimationReplay(null, node.id)}
            >
              Play it again
            </button>
          </div>
        ) : null}
      </InspectorSection>

      {on ? (
        <>
          <InspectorSection title="When it plays">
            <Segmented<BuilderAnimationTrigger>
              fullWidth
              compact
              value={trigger}
              onChange={(next) =>
                patchAnimation({
                  animationTrigger: next === "load" ? undefined : next,
                  // Repeat only means something for the scroll trigger.
                  ...(next === "scroll" ? {} : { animationRepeat: undefined }),
                })
              }
              options={[
                { value: "scroll", label: "On scroll into view" },
                { value: "load", label: "When the page loads" },
                { value: "hover", label: "On hover" },
              ]}
            />
            <span className={HINT}>
              {trigger === "hover"
                ? "The element sits still until a visitor points at it, then plays. It also plays on keyboard focus."
                : trigger === "scroll"
                  ? "Plays as the element travels into the visible part of the page."
                  : "Plays once, as soon as the page paints."}
            </span>
          </InspectorSection>

          {trigger === "scroll" ? (
            <InspectorSection title="Repeat">
              <Segmented<BuilderAnimationRepeat>
                fullWidth
                compact
                value={repeat}
                onChange={(next) =>
                  patchAnimation({
                    animationRepeat: next === "every" ? undefined : next,
                  })
                }
                options={[
                  { value: "once", label: "Just once" },
                  { value: "every", label: "Every time" },
                ]}
              />
              <span className={HINT}>
                {repeat === "once"
                  ? "Plays the first time the element scrolls in, then stays put."
                  : "Playback follows the scroll position, so it runs again on every pass. Browsers without scroll-linked animation play it once on load instead."}
              </span>
            </InspectorSection>
          ) : null}

          <InspectorSection title="Speed">
            <Segmented<string>
              fullWidth
              compact
              value={msToCssTime(durationMs)}
              onChange={(next) =>
                patchAnimation({
                  animationDuration:
                    next === BUILDER_ANIMATION_DEFAULT_DURATION ? undefined : next,
                })
              }
              options={BUILDER_ANIMATION_SPEED_PRESETS.map((s) => ({
                value: s.value,
                label: s.label,
              }))}
            />
            <InspectorField
              label="Fine tune"
              help="Drag for anything between a tenth of a second and two and a half seconds."
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={100}
                  max={2500}
                  step={50}
                  value={durationMs}
                  aria-label="Animation length in milliseconds"
                  className="w-full"
                  onChange={(e) =>
                    patchAnimation({
                      animationDuration: msToCssTime(Number(e.target.value)),
                    })
                  }
                />
                <span
                  className="shrink-0 tabular-nums text-[11px]"
                  style={{ color: CHROME.muted, minWidth: 40 }}
                >
                  {msToCssTime(durationMs)}
                </span>
              </div>
            </InspectorField>
          </InspectorSection>

          <InspectorSection title="Delay">
            <Segmented<string>
              fullWidth
              compact
              value={delay}
              onChange={(next) =>
                patchAnimation({
                  animationDelay:
                    next === BUILDER_ANIMATION_DEFAULT_DELAY ? undefined : next,
                })
              }
              options={DELAY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <span className={HINT}>
              A short wait before it starts. Stagger a few elements to make a
              group arrive in sequence.
            </span>
          </InspectorSection>

          {travels ? (
            <InspectorSection title="Distance">
              <FieldRow>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={4}
                    max={160}
                    step={2}
                    value={distancePx}
                    aria-label="Travel distance in pixels"
                    className="w-full"
                    onChange={(e) =>
                      patchAnimation({
                        animationDistance: `${Number(e.target.value)}px`,
                      })
                    }
                  />
                  <span
                    className="shrink-0 tabular-nums text-[11px]"
                    style={{ color: CHROME.muted, minWidth: 40 }}
                  >
                    {distancePx}px
                  </span>
                </div>
                <span className={HINT}>
                  How far the element travels before it settles.
                </span>
              </FieldRow>
            </InspectorSection>
          ) : null}

          <details>
            <summary
              className="flex cursor-pointer select-none items-center justify-between text-[11px] font-medium"
              style={{ color: CHROME.muted, listStyle: "none", outline: "none" }}
            >
              <span>Advanced</span>
              <span style={{ fontSize: 9 }}>&rsaquo;</span>
            </summary>
            <div className="mt-2">
              <InspectorField
                label="Motion feel"
                help="Shapes the acceleration curve. Natural is the right answer almost every time."
              >
                <Segmented<AnimationEasing>
                  fullWidth
                  compact
                  value={easing}
                  onChange={(next) =>
                    patchAnimation({
                      animationEasing: next === DEFAULT_EASING ? undefined : next,
                    })
                  }
                  options={EASING_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
              </InspectorField>
              {/* The raw curve. Came across from the Style tab's Effects fold
                  rather than being deleted with the rest of it: it is the one
                  animation control that genuinely wants CSS syntax, and it
                  overrides the friendly picker above. */}
              <InspectorField
                label="Custom curve"
                help="Overrides the choice above. Any CSS timing function: cubic-bezier(), steps(), linear()."
              >
                <input
                  type="text"
                  className="w-full px-2"
                  placeholder="cubic-bezier(.2,.8,.2,1)"
                  aria-label="Custom easing curve"
                  defaultValue={style?.animationEasingCustom ?? ""}
                  style={{
                    height: 30,
                    fontSize: 12,
                    background: CHROME.surface,
                    border: `1px solid ${CHROME.lineStrong}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  onBlur={(e) =>
                    patchAnimation({
                      animationEasingCustom: e.target.value.trim() || undefined,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              </InspectorField>
            </div>
          </details>
        </>
      ) : null}

      <InspectorNotice>
        Visitors who ask their device for reduced motion always see this element
        at rest, with no animation. That setting wins over everything on this
        tab.
      </InspectorNotice>
    </InspectorBody>
  );
}
