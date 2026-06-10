"use client";

/**
 * NodeMotionPanel — node-level animation controls for standalone builder nodes.
 *
 * Surfaces the rich motion system already defined in BuilderNodeStyleValue and
 * rendered by builder-node/render.tsx — entrance animation, trigger, reveal-on-
 * view, parallax, and hover state style — without touching the render engine.
 *
 * Patches write to the node's `style` object via patchBuilderNodeProps. Motion
 * props live at the ROOT level of BuilderNodeStyle (not inside responsive
 * breakpoints) because they describe page-load / scroll behaviour, not
 * viewport overrides. Hover overrides are at BuilderNodeStyle.hover.
 *
 * UX mirrors the section MotionPanel: Segmented chip rows, toggle-to-clear
 * (clicking the active chip removes the value), and an accessibility note for
 * reduced-motion.
 *
 * Reduced-motion: this panel surfaces prefers-reduced-motion awareness via a
 * notice — the render engine already guards all animation rules with the OS
 * preference. Operators can set props freely; the renderer handles the rest.
 */

import { useRef, type ReactElement } from "react";

import {
  type BuilderNode,
  type BuilderNodeStyle,
  type BuilderNodeStyleValue,
  type BuilderNodeHoverStyle,
} from "@/lib/site-admin/builder-node";
import { useEditContext } from "../edit-context";
import { Segmented } from "../kit/segmented";
import {
  INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL,
  INSPECTOR_HELP_TEXT_CLASS as HINT,
  InspectorBody,
  InspectorNotice,
  InspectorSection,
} from "./kit/inspector-ui";

// ── Prop shape types ──────────────────────────────────────────────────────────

type AnimationPreset = NonNullable<BuilderNodeStyleValue["animationPreset"]>;
type AnimationTrigger = NonNullable<BuilderNodeStyleValue["animationTrigger"]>;
type AnimationEasing = NonNullable<BuilderNodeStyleValue["animationEasing"]>;
type RevealOnView = NonNullable<BuilderNodeStyleValue["revealOnView"]>;
type Parallax = NonNullable<BuilderNodeStyleValue["parallax"]>;

// ── SVG icon set (matches motion-panel.tsx visual language) ──────────────────

const NoneIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" opacity="0.45" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const FadeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
  </svg>
);

const RiseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="3" width="14" height="14" rx="2" opacity="0.45" />
    <path d="M12 22 V 18" /><path d="M9 21 L 12 18 L 15 21" />
  </svg>
);

const FallIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="7" width="14" height="14" rx="2" opacity="0.45" />
    <path d="M12 2 V 6" /><path d="M9 3 L 12 6 L 15 3" />
  </svg>
);

const ZoomInIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <rect x="3" y="3" width="18" height="18" rx="2" opacity="0.35" />
  </svg>
);

const SlideLeftIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="14" height="14" rx="2" opacity="0.45" />
    <path d="M22 12 H 18" /><path d="M21 9 L 18 12 L 21 15" />
  </svg>
);

const SlideRightIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7" y="5" width="14" height="14" rx="2" opacity="0.45" />
    <path d="M2 12 H 6" /><path d="M3 9 L 6 12 L 3 15" />
  </svg>
);

const BlurInIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="14" height="14" rx="3" opacity="0.35" />
    <rect x="8" y="8" width="8" height="8" rx="2" />
  </svg>
);

const FlipInIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7 L 19 5 L 19 17 L 5 19 Z" />
  </svg>
);

const BounceInIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 18 Q 8 4 12 14 Q 16 22 20 6" />
  </svg>
);

const ScrollIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9 L 21 7" opacity="0.35" />
    <path d="M3 14 L 21 12" />
    <path d="M3 19 L 21 17" opacity="0.6" />
  </svg>
);

// ── Animation preset options ──────────────────────────────────────────────────

const PRESET_ICONS: Record<AnimationPreset, () => ReactElement> = {
  none: NoneIcon,
  "fade-in": FadeIcon,
  rise: RiseIcon,
  fall: FallIcon,
  "zoom-in": ZoomInIcon,
  "slide-left": SlideLeftIcon,
  "slide-right": SlideRightIcon,
  "blur-in": BlurInIcon,
  "flip-in": FlipInIcon,
  "bounce-in": BounceInIcon,
};

const PRESET_OPTIONS: ReadonlyArray<{ value: AnimationPreset; label: string }> = [
  { value: "none", label: "None" },
  { value: "fade-in", label: "Fade" },
  { value: "rise", label: "Rise" },
  { value: "fall", label: "Fall" },
  { value: "zoom-in", label: "Zoom" },
  { value: "slide-left", label: "← Slide" },
  { value: "slide-right", label: "Slide →" },
  { value: "blur-in", label: "Blur" },
  { value: "flip-in", label: "Flip" },
  { value: "bounce-in", label: "Bounce" },
];

const EASING_OPTIONS: ReadonlyArray<{ value: AnimationEasing; label: string }> = [
  { value: "ease", label: "Ease" },
  { value: "ease-out", label: "Out" },
  { value: "ease-in", label: "In" },
  { value: "ease-in-out", label: "In-Out" },
  { value: "back", label: "Back" },
  { value: "smooth", label: "Smooth" },
  { value: "linear", label: "Linear" },
];

const REVEAL_OPTIONS: ReadonlyArray<{ value: RevealOnView; label: string }> = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "fade-up", label: "Up" },
  { value: "fade-down", label: "Down" },
  { value: "fade-left", label: "Left" },
  { value: "fade-right", label: "Right" },
  { value: "zoom", label: "Zoom" },
];

const PARALLAX_OPTIONS: ReadonlyArray<{ value: Parallax; label: string }> = [
  { value: "none", label: "None" },
  { value: "subtle", label: "Subtle" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

// ── Clean helpers (motion-specific subset — avoids importing from style-panel) ─

/** Strip undefined/null motion fields from a partial style patch. */
function cleanMotionStylePatch(
  patch: Partial<BuilderNodeStyleValue>,
): Partial<BuilderNodeStyleValue> {
  const out: Partial<BuilderNodeStyleValue> = {};
  const keys = Object.keys(patch) as Array<keyof BuilderNodeStyleValue>;
  for (const k of keys) {
    const v = patch[k];
    if (v !== undefined && v !== null && v !== "") {
      // Safe: we only set known motion keys from our own options above.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = v;
    }
  }
  return out;
}

function cleanHoverStyle(
  value: BuilderNodeHoverStyle | undefined,
): BuilderNodeHoverStyle | undefined {
  if (!value) return undefined;
  const out: BuilderNodeHoverStyle = {};
  if (value.backgroundColor) out.backgroundColor = value.backgroundColor;
  if (value.color) out.color = value.color;
  if (value.borderColor) out.borderColor = value.borderColor;
  if (value.boxShadow) out.boxShadow = value.boxShadow;
  if (value.scale) out.scale = value.scale;
  if (value.translate) out.translate = value.translate;
  if (typeof value.opacity === "number") out.opacity = value.opacity;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface NodeMotionPanelProps {
  node: Exclude<BuilderNode, { kind: "section" }>;
  onPatchNodeProps: (nodeId: string, patch: Record<string, unknown>) => Promise<void>;
}

export function NodeMotionPanel({ node, onPatchNodeProps }: NodeMotionPanelProps) {
  const { device } = useEditContext();
  const nonDesktop = device !== "desktop";

  // Serialise async patches so rapid clicks don't race each other.
  const patchChainRef = useRef<Promise<void>>(Promise.resolve());

  const currentStyle = (node.props as { style?: BuilderNodeStyle }).style;

  // ── Patch helpers ──────────────────────────────────────────────────────────

  /** Merge a partial motion patch into the node's root style. */
  function patchMotion(patch: Partial<BuilderNodeStyleValue>) {
    const cleaned = cleanMotionStylePatch(patch);
    const nextStyle: BuilderNodeStyle = {
      ...currentStyle,
      ...cleaned,
    };
    // Remove keys whose value was explicitly cleared (set to undefined via
    // toggle-to-clear). We spread undefined which doesn't delete — do it
    // manually for the keys that were passed.
    for (const k of Object.keys(patch) as Array<keyof BuilderNodeStyleValue>) {
      const v = patch[k];
      if (v === undefined || v === null || v === "") {
        delete (nextStyle as Record<string, unknown>)[k];
      }
    }
    patchChainRef.current = patchChainRef.current
      .catch(() => { /* keep chain alive */ })
      .then(async () => {
        await onPatchNodeProps(node.id, { style: nextStyle });
      });
  }

  /** Merge a hover-state patch. Pass `undefined` to clear the whole hover block. */
  function patchHover(patch: Partial<BuilderNodeHoverStyle> | undefined) {
    const prevHover = currentStyle?.hover ?? {};
    const merged: BuilderNodeHoverStyle = patch
      ? { ...prevHover, ...patch }
      : {};
    // Remove explicitly cleared keys.
    if (patch) {
      for (const k of Object.keys(patch) as Array<keyof BuilderNodeHoverStyle>) {
        if (patch[k] === undefined || patch[k] === null || patch[k] === "") {
          delete (merged as Record<string, unknown>)[k];
        }
      }
    }
    const nextHover = cleanHoverStyle(merged);
    const nextStyle: BuilderNodeStyle = {
      ...currentStyle,
      hover: nextHover,
    };
    if (!nextHover) delete nextStyle.hover;
    patchChainRef.current = patchChainRef.current
      .catch(() => { /* keep chain alive */ })
      .then(async () => {
        await onPatchNodeProps(node.id, { style: nextStyle });
      });
  }

  // ── Current values ─────────────────────────────────────────────────────────

  const preset = (currentStyle?.animationPreset ?? "none") as AnimationPreset;
  const trigger = (currentStyle?.animationTrigger ?? "load") as AnimationTrigger;
  const easing = (currentStyle?.animationEasing ?? "ease-out") as AnimationEasing;
  const revealOnView = (currentStyle?.revealOnView ?? "none") as RevealOnView;
  const parallax = (currentStyle?.parallax ?? "none") as Parallax;
  const hoverScale = currentStyle?.hover?.scale ?? "";
  const hoverTranslate = currentStyle?.hover?.translate ?? "";
  const hoverBoxShadow = currentStyle?.hover?.boxShadow ?? "";

  const hasEntrance = preset && preset !== "none";
  const hasReveal = revealOnView && revealOnView !== "none";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <InspectorBody>
      {nonDesktop ? (
        <InspectorNotice tone="info">
          Motion applies to the published page and is the same across all viewports.
          Switch to Desktop to edit — controls are always live.
        </InspectorNotice>
      ) : null}

      {/* Entrance animation */}
      <InspectorSection
        title="Entrance animation"
        description={
          hasEntrance
            ? `${PRESET_OPTIONS.find((o) => o.value === preset)?.label ?? preset} · plays once on load`
            : "Plays once when the page first loads. Off by default."
        }
      >
        <div
          role="radiogroup"
          aria-label="Entrance animation preset"
          style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}
        >
          {PRESET_OPTIONS.map((opt) => {
            const Icon = PRESET_ICONS[opt.value];
            const active = preset === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={opt.label}
                title={opt.label}
                onClick={() => {
                  patchMotion({
                    animationPreset: active ? undefined : opt.value,
                    // Clear trigger/easing when resetting to none so the node
                    // doesn't carry ghost animation props.
                    ...(active ? {
                      animationTrigger: undefined,
                      animationEasing: undefined,
                      animationDuration: undefined,
                      animationDelay: undefined,
                    } : {}),
                  });
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  padding: "6px 4px",
                  borderRadius: 6,
                  border: `1px solid ${active ? "var(--color-violet-500, #7c3aed)" : "rgba(0,0,0,0.10)"}`,
                  background: active ? "var(--color-violet-50, #f5f3ff)" : "white",
                  color: active ? "var(--color-violet-700, #6d28d9)" : "#71717a",
                  cursor: "pointer",
                  fontSize: 10,
                  lineHeight: 1.2,
                  fontWeight: active ? 600 : 400,
                  transition: "all 0.12s",
                }}
              >
                <Icon />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </InspectorSection>

      {/* Trigger + timing — only shown when a preset is set */}
      {hasEntrance ? (
        <>
          <InspectorSection title="Trigger">
            <Segmented<AnimationTrigger>
              fullWidth
              compact
              value={trigger}
              onChange={(next) => patchMotion({ animationTrigger: next })}
              options={[
                {
                  value: "load",
                  label: "On load",
                },
                {
                  value: "scroll",
                  label: (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <ScrollIcon /> Scroll-driven
                    </span>
                  ),
                },
              ]}
            />
            <span className={HINT}>
              {trigger === "scroll"
                ? "Animation position is driven by how far the element has scrolled through the viewport. Falls back to load in unsupported browsers."
                : "Plays once when the page loads, regardless of scroll position."}
            </span>
          </InspectorSection>

          <InspectorSection title="Easing">
            <Segmented<AnimationEasing>
              fullWidth
              compact
              value={easing}
              onChange={(next) => patchMotion({ animationEasing: next })}
              options={EASING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </InspectorSection>
        </>
      ) : null}

      {/* Reveal on view */}
      <InspectorSection
        title="Scroll reveal"
        description={
          hasReveal
            ? `${REVEAL_OPTIONS.find((o) => o.value === revealOnView)?.label ?? revealOnView} · plays once on scroll into view`
            : "IntersectionObserver-driven reveal. Plays once when the node scrolls into view — works in all modern browsers."
        }
      >
        <Segmented<RevealOnView>
          fullWidth
          compact
          value={revealOnView}
          onChange={(next) => {
            patchMotion({
              revealOnView: next === "none" ? undefined : next,
              // Clear sub-props when turning off reveal.
              ...(next === "none" ? {
                revealDistance: undefined,
                revealDuration: undefined,
                revealDelay: undefined,
                revealEasing: undefined,
              } : {}),
            });
          }}
          options={REVEAL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <span className={HINT}>
          Skipped for visitors who prefer reduced motion — they see the node at its resting
          state immediately.
        </span>
      </InspectorSection>

      {/* Reveal sub-controls */}
      {hasReveal ? (
        <InspectorSection title="Reveal timing">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className={FIELD_LABEL}>Duration</span>
              <input
                type="text"
                placeholder="0.6s"
                defaultValue={currentStyle?.revealDuration ?? ""}
                aria-label="Reveal duration (CSS time, e.g. 0.6s or 400ms)"
                onBlur={(e) => patchMotion({ revealDuration: e.target.value.trim() || undefined })}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{
                  width: "100%",
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.12)",
                  fontSize: 12,
                  outline: "none",
                  background: "white",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className={FIELD_LABEL}>Delay</span>
              <input
                type="text"
                placeholder="0s"
                defaultValue={currentStyle?.revealDelay ?? ""}
                aria-label="Reveal delay (CSS time, e.g. 0s or 200ms)"
                onBlur={(e) => patchMotion({ revealDelay: e.target.value.trim() || undefined })}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{
                  width: "100%",
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.12)",
                  fontSize: 12,
                  outline: "none",
                  background: "white",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className={FIELD_LABEL}>Travel distance</span>
              <input
                type="text"
                placeholder="24px"
                defaultValue={currentStyle?.revealDistance ?? ""}
                aria-label="Reveal travel distance (CSS length, e.g. 24px or 2rem). Used by directional reveal variants."
                onBlur={(e) => patchMotion({ revealDistance: e.target.value.trim() || undefined })}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{
                  width: "100%",
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.12)",
                  fontSize: 12,
                  outline: "none",
                  background: "white",
                }}
              />
              <span className={HINT}>
                Applies to directional variants (fade-up, fade-down, etc.). Ignored for plain fade and zoom.
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className={FIELD_LABEL}>Easing</span>
              <Segmented<AnimationEasing>
                fullWidth
                compact
                value={(currentStyle?.revealEasing ?? "ease-out") as AnimationEasing}
                onChange={(next) => patchMotion({ revealEasing: next })}
                options={EASING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>
          </div>
        </InspectorSection>
      ) : null}

      {/* Parallax */}
      <InspectorSection
        title="Parallax"
        description={
          parallax && parallax !== "none"
            ? `${parallax.charAt(0).toUpperCase() + parallax.slice(1)} vertical drift as the visitor scrolls.`
            : "Scroll-driven vertical drift. Independent of entrance animation — a node can have both."
        }
      >
        <Segmented<Parallax>
          fullWidth
          compact
          value={parallax}
          onChange={(next) => patchMotion({ parallax: next === "none" ? undefined : next })}
          options={PARALLAX_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <span className={HINT}>
          When both an entrance animation and parallax are set, parallax wins the animation slot
          on published pages. Falls back to no motion where scroll-driven animations aren&apos;t
          supported, and for visitors who prefer reduced motion.
        </span>
      </InspectorSection>

      {/* Hover state */}
      <InspectorSection
        title="Hover"
        description="Style overrides applied on cursor-over. Pairs with the CSS transition on the Style tab."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={FIELD_LABEL}>Scale</span>
            <input
              type="text"
              placeholder="1.03"
              defaultValue={hoverScale}
              aria-label="Hover scale (unitless factor, e.g. 1.03)"
              onBlur={(e) => patchHover({ scale: e.target.value.trim() || undefined })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              style={{
                width: "100%",
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.12)",
                fontSize: 12,
                outline: "none",
                background: "white",
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={FIELD_LABEL}>Translate</span>
            <input
              type="text"
              placeholder="0 -4px"
              defaultValue={hoverTranslate}
              aria-label="Hover translate (1-2 CSS lengths, e.g. 0 -4px)"
              onBlur={(e) => patchHover({ translate: e.target.value.trim() || undefined })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              style={{
                width: "100%",
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.12)",
                fontSize: 12,
                outline: "none",
                background: "white",
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={FIELD_LABEL}>Box shadow</span>
            <input
              type="text"
              placeholder="0 8px 24px rgba(0,0,0,0.12)"
              defaultValue={hoverBoxShadow}
              aria-label="Hover box-shadow (CSS box-shadow value)"
              onBlur={(e) => patchHover({ boxShadow: e.target.value.trim() || undefined })}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              style={{
                width: "100%",
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.12)",
                fontSize: 12,
                outline: "none",
                background: "white",
              }}
            />
          </div>
          {(hoverScale || hoverTranslate || hoverBoxShadow) ? (
            <button
              type="button"
              onClick={() => patchHover(undefined)}
              style={{
                alignSelf: "flex-start",
                fontSize: 11,
                color: "#9ca3af",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "2px 0",
                textDecoration: "underline",
              }}
            >
              Clear hover overrides
            </button>
          ) : null}
        </div>
      </InspectorSection>

      {/* Reduced-motion notice */}
      <InspectorNotice>
        All animations respect <em>prefers-reduced-motion</em>. Visitors who
        request reduced motion see the node at its resting state — no transition,
        no delay.
      </InspectorNotice>
    </InspectorBody>
  );
}
