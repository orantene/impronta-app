/**
 * StylePanel · EffectsSection domain sub-section (W5-C1).
 *
 * Carved verbatim from style-panel.tsx's render body. Receives the exact
 * closure values the parent held, so runtime behavior is identical — same
 * controls, same values, same tree mutation on edit.
 */

import { Segmented } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";
import { BUILDER_NODE_ANIMATION_EASING_OPTIONS, BUILDER_NODE_ANIMATION_PRESET_OPTIONS, BUILDER_NODE_ANIMATION_TRIGGER_OPTIONS, BUILDER_NODE_CURSOR_OPTIONS, BUILDER_NODE_POINTER_EVENTS_OPTIONS, BUILDER_NODE_SCROLL_SNAP_ALIGN_OPTIONS, BUILDER_NODE_USER_SELECT_OPTIONS } from "./style-options";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import type { StandaloneSectionCtx } from "./section-types";
import { InteractionsBody } from "./EffectsSurfaceSection";
import { EffectsStatesSection } from "./EffectsStatesSection";

export type EffectsSectionProps = Pick<
  StandaloneSectionCtx,
  "patchSelectedBaseStyle" | "patchSelectedHoverStyle" | "patchSelectedStandaloneStyle" | "patchSelectedStateStyle" | "selectedInteractionState" | "selectedStandaloneFullStyle" | "selectedStandaloneStyleNode" | "selectedStandaloneViewportStyle" | "setOrToggleStandaloneStyle" | "setSelectedInteractionState"
>;

/**
 * D4 — the motion part of the ONE "Advanced" group's body: transitions,
 * entrance animation, scroll parallax/reveal, and the hover/focus/active
 * state editor.
 *
 * Two changes, both structural:
 *  - The "Effects & motion" accordion wrapper is gone; `groups/AdvancedGroup`
 *    owns the single Advanced accordion these fields live in now.
 *  - `SurfaceDepthBody` (shadow, opacity, background image) is NO LONGER
 *    mounted here — it moved to the Appearance group, where an operator
 *    looking for a drop shadow actually looks. `InteractionsBody` (parallax /
 *    reveal) stays, because scroll motion is genuinely advanced.
 */
export function EffectsMotionBody({
  patchSelectedBaseStyle,
  patchSelectedHoverStyle,
  patchSelectedStandaloneStyle,
  patchSelectedStateStyle,
  selectedInteractionState,
  selectedStandaloneFullStyle,
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  setOrToggleStandaloneStyle,
  setSelectedInteractionState,
}: EffectsSectionProps) {
  return (
            <>
            <div
              className="border-t pt-3"
              data-builder-node-style-control="effects-interaction"
              style={{ borderColor: CHROME.line }}
            >
              <details>
                <summary className="flex items-center justify-between select-none" style={{ cursor: "pointer", outline: "none", listStyle: "none" }}>
                  <span className={FIELD_LABEL}>Effects &amp; interaction</span>
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
              </summary>
              <div className="flex flex-col gap-2 mt-2">
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="transitionProperty"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Transition props
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="background-color, color, scale"
                  value={selectedStandaloneViewportStyle?.transitionProperty ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      transitionProperty: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="transitionDuration"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Duration
                  </span>
                  <input
                    type="text"
                    className="px-2"
                    style={{
                      height: 30,
                      width: "100%",
                      fontSize: 12,
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    placeholder=".2s"
                    value={selectedStandaloneViewportStyle?.transitionDuration ?? ""}
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        transitionDuration: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="transitionTimingFunction"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Easing
                  </span>
                  <input
                    type="text"
                    className="px-2"
                    style={{
                      height: 30,
                      width: "100%",
                      fontSize: 12,
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    placeholder="ease"
                    value={
                      selectedStandaloneViewportStyle?.transitionTimingFunction ?? ""
                    }
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        transitionTimingFunction:
                          e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="transitionDelay"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Delay
                  </span>
                  <input
                    type="text"
                    className="px-2"
                    style={{
                      height: 30,
                      width: "100%",
                      fontSize: 12,
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    placeholder="0s"
                    value={selectedStandaloneViewportStyle?.transitionDelay ?? ""}
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        transitionDelay: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="clipPath"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Clip path
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="circle(50%) · polygon(0 0,100% 0,100% 80%,0 100%)"
                  value={selectedStandaloneViewportStyle?.clipPath ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      clipPath: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="maskImage"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Mask image
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="linear-gradient(#000,transparent) · url(mask.svg)"
                  value={selectedStandaloneViewportStyle?.maskImage ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      maskImage: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="textStroke"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Text stroke (outline glyphs)
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="e.g. 1px #111111"
                  value={selectedStandaloneViewportStyle?.textStroke ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      textStroke: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="outline"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Outline (layout-neutral ring)
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="2px solid #6366f1"
                  value={selectedStandaloneViewportStyle?.outline ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      outline: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="outlineOffset"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Outline offset
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="2px · -1px"
                  value={selectedStandaloneViewportStyle?.outlineOffset ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      outlineOffset: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="accentColor"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Accent (checkbox / radio / range)
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="e.g. #6366f1"
                  value={selectedStandaloneViewportStyle?.accentColor ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      accentColor: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="caretColor"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Caret (text-input cursor)
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="#6366f1"
                  value={selectedStandaloneViewportStyle?.caretColor ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      caretColor: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="cursor"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Cursor
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.cursor ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      cursor: (next || undefined) as BuilderNodeStyleValue["cursor"],
                    })
                  }
                  options={BUILDER_NODE_CURSOR_OPTIONS}
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="userSelect"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Text selection
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.userSelect ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      userSelect: (next || undefined) as BuilderNodeStyleValue["userSelect"],
                    })
                  }
                  options={BUILDER_NODE_USER_SELECT_OPTIONS}
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="pointerEvents"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Pointer events
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.pointerEvents ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      pointerEvents: (next || undefined) as BuilderNodeStyleValue["pointerEvents"],
                    })
                  }
                  options={BUILDER_NODE_POINTER_EVENTS_OPTIONS}
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="scrollSnapType"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Scroll-snap track
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="x mandatory · y proximity"
                  value={selectedStandaloneViewportStyle?.scrollSnapType ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      scrollSnapType: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="scrollSnapAlign"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Snap align (child)
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.scrollSnapAlign ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      scrollSnapAlign: (next || undefined) as BuilderNodeStyleValue["scrollSnapAlign"],
                    })
                  }
                  options={BUILDER_NODE_SCROLL_SNAP_ALIGN_OPTIONS}
                />
              </div>
              </div>
              </details>
            </div>

            <div
              className="border-t pt-3"
              data-builder-node-style-control="entrance-animation"
              style={{ borderColor: CHROME.line }}
            >
              <details>
                <summary className="flex items-center justify-between select-none" style={{ cursor: "pointer", outline: "none", listStyle: "none" }}>
                  <span className={FIELD_LABEL}>Entrance animation</span>
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                </summary>
              <div className="flex flex-col gap-2 mt-2">
              <p className="text-[10px] leading-snug" style={{ color: CHROME.muted }}>
                Plays once when the published page loads (not previewed in the
                editor). Respects reduced-motion.
              </p>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="animationPreset"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Effect
                </span>
                <Segmented
                  value={selectedStandaloneViewportStyle?.animationPreset ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      animationPreset: (next || undefined) as BuilderNodeStyleValue["animationPreset"],
                    })
                  }
                  options={BUILDER_NODE_ANIMATION_PRESET_OPTIONS}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="animationDuration"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Duration
                  </span>
                  <input
                    type="text"
                    className="px-2"
                    style={{
                      height: 30,
                      width: "100%",
                      fontSize: 12,
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    placeholder="0.6s"
                    value={selectedStandaloneViewportStyle?.animationDuration ?? ""}
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        animationDuration: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="animationDelay"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Delay
                  </span>
                  <input
                    type="text"
                    className="px-2"
                    style={{
                      height: 30,
                      width: "100%",
                      fontSize: 12,
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    placeholder="0s"
                    value={selectedStandaloneViewportStyle?.animationDelay ?? ""}
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        animationDelay: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="animationTrigger"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Trigger
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.animationTrigger ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      animationTrigger: (next || undefined) as BuilderNodeStyleValue["animationTrigger"],
                    })
                  }
                  options={BUILDER_NODE_ANIMATION_TRIGGER_OPTIONS}
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="animationEasing"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Easing
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.animationEasing ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      animationEasing: (next || undefined) as BuilderNodeStyleValue["animationEasing"],
                    })
                  }
                  options={BUILDER_NODE_ANIMATION_EASING_OPTIONS}
                />
              </div>
              {/* Wave 6B (#27) — custom easing curve. A raw cubic-bezier / steps /
                  linear() that overrides the named easing above for exact timing. */}
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="animationEasingCustom"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Custom curve
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="cubic-bezier(.2,.8,.2,1)"
                  value={selectedStandaloneViewportStyle?.animationEasingCustom ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      animationEasingCustom: e.target.value.trim() || undefined,
                    })
                  }
                />
                <span className="text-[10px] leading-snug" style={{ color: CHROME.muted }}>
                  Overrides the named easing. Any CSS timing function:
                  cubic-bezier(), steps(), linear().
                </span>
              </div>
              </div>
              </details>
            </div>

            {/* ── Interactions (Wave 6B / #27) — scroll parallax. Hover micro-
                interactions live in the States block below; this surfaces the
                ongoing scroll-driven motion alongside the entrance animation. ── */}
            <InteractionsBody
              patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
              selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
            />
            <EffectsStatesSection
              patchSelectedBaseStyle={patchSelectedBaseStyle}
              patchSelectedHoverStyle={patchSelectedHoverStyle}
              patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
              patchSelectedStateStyle={patchSelectedStateStyle}
              selectedInteractionState={selectedInteractionState}
              selectedStandaloneFullStyle={selectedStandaloneFullStyle}
              selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
              setSelectedInteractionState={setSelectedInteractionState}
            />
            </>
  );
}
