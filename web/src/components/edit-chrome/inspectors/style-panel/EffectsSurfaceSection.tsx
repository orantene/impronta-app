/**
 * StylePanel · EffectsSurfaceSection — sub-section of Effects & motion (W5-C1 file-size split).
 *
 * Carved verbatim from EffectsSection so each file stays under the 800-line
 * budget. Renders a Fragment of the same sibling blocks that were direct
 * children of the Effects InspectorGroup, so runtime output is identical.
 */

import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import { Segmented } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { BackgroundLayersEditor, GradientStopsBuilder } from "../css-value-builders";
import { ShadowStackBuilder } from "./shadow-stack-builder";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";
import { InspectorLabelWithInfo } from "../kit";
import { BUILDER_NODE_ANIMATION_EASING_OPTIONS, BUILDER_NODE_BG_CLIP_OPTIONS, BUILDER_NODE_BG_REPEAT_OPTIONS, BUILDER_NODE_PARALLAX_OPTIONS, BUILDER_NODE_REVEAL_OPTIONS } from "./style-options";
import { GlyphTiles, SHADOW_PRESETS, shadowTileOptions } from "../field-kit";
import { parseStyleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { ThemeBindRow } from "./section-shared";
import type { StandaloneSectionCtx } from "./section-types";

export type EffectsSurfaceSectionProps = Pick<
  StandaloneSectionCtx,
  "patchSelectedStandaloneStyle" | "selectedStandaloneViewportStyle" | "setOrToggleStandaloneStyle"
>;

/**
 * D4 — the SCROLL-MOTION half of this file (parallax, reveal-on-view).
 *
 * This file used to render two unrelated blocks back to back: motion, and
 * "Surface & depth" (shadow, opacity, background image). D4 sends them to
 * different groups — motion is Advanced, surface is Appearance — so the file
 * now exports the two halves separately instead of one Fragment holding both.
 * No field moved between the halves.
 */
export function InteractionsBody({
  patchSelectedStandaloneStyle,
  selectedStandaloneViewportStyle,
}: Omit<EffectsSurfaceSectionProps, "setOrToggleStandaloneStyle">) {
  return (
    <>
            <div
              className="border-t pt-3"
              data-builder-node-style-control="interactions"
              style={{ borderColor: CHROME.line }}
            >
              <details>
                <summary className="flex items-center justify-between select-none" style={{ cursor: "pointer", outline: "none", listStyle: "none" }}>
                  <InspectorLabelWithInfo
                    label="Interactions"
                    info={
                      <>
                        Scroll parallax drifts the block as the visitor scrolls past
                        (published page only). Pair it with a hover effect in{" "}
                        <strong>States</strong> below for full motion. Respects
                        reduced-motion.
                      </>
                    }
                    className={FIELD_LABEL}
                  />
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                </summary>
              <div className="flex flex-col gap-2 mt-2">
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="parallax"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  <InspectorLabelWithInfo
                    label="Scroll parallax"
                    info="The block glides vertically over its on-screen pass. Drives the entrance slot when both are set. Entrance plays once, parallax is what keeps moving."
                  />
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.parallax ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      parallax: (next || undefined) as BuilderNodeStyleValue["parallax"],
                    })
                  }
                  options={BUILDER_NODE_PARALLAX_OPTIONS}
                />
              </div>
              {/* Reveal on scroll (2026-06-04) — IntersectionObserver entry.
                  Unlike the entrance preset (plays on load) this fires the first
                  time the block scrolls into view, with a direction + travel
                  distance + easing. Published page only; respects reduced-motion. */}
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="revealOnView"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  <InspectorLabelWithInfo
                    label="Reveal on scroll"
                    info="Eases in the first time the block scrolls into view, then stays. Direction variants travel by the distance below."
                  />
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.revealOnView ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      revealOnView: (next || undefined) as BuilderNodeStyleValue["revealOnView"],
                    })
                  }
                  options={BUILDER_NODE_REVEAL_OPTIONS}
                />
                {selectedStandaloneViewportStyle?.revealOnView &&
                selectedStandaloneViewportStyle.revealOnView !== "none" ? (
                  <>
                    {selectedStandaloneViewportStyle.revealOnView !== "fade" &&
                    selectedStandaloneViewportStyle.revealOnView !== "zoom" ? (
                      <div
                        className="flex flex-col gap-1.5"
                        data-builder-node-style-control="revealDistance"
                      >
                        <span className="text-[11px]" style={{ color: CHROME.muted }}>
                          Distance
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
                          placeholder="24px"
                          value={selectedStandaloneViewportStyle?.revealDistance ?? ""}
                          onChange={(e) =>
                            patchSelectedStandaloneStyle({
                              revealDistance: e.target.value.trim() || undefined,
                            })
                          }
                        />
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <div
                        className="flex flex-col gap-1.5"
                        data-builder-node-style-control="revealDuration"
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
                          value={selectedStandaloneViewportStyle?.revealDuration ?? ""}
                          onChange={(e) =>
                            patchSelectedStandaloneStyle({
                              revealDuration: e.target.value.trim() || undefined,
                            })
                          }
                        />
                      </div>
                      <div
                        className="flex flex-col gap-1.5"
                        data-builder-node-style-control="revealDelay"
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
                          value={selectedStandaloneViewportStyle?.revealDelay ?? ""}
                          onChange={(e) =>
                            patchSelectedStandaloneStyle({
                              revealDelay: e.target.value.trim() || undefined,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div
                      className="flex flex-col gap-1.5"
                      data-builder-node-style-control="revealEasing"
                    >
                      <span className="text-[11px]" style={{ color: CHROME.muted }}>
                        Easing
                      </span>
                      <Segmented
                        fullWidth
                        compact
                        value={selectedStandaloneViewportStyle?.revealEasing ?? ""}
                        onChange={(next) =>
                          patchSelectedStandaloneStyle({
                            revealEasing: (next || undefined) as BuilderNodeStyleValue["revealEasing"],
                          })
                        }
                        options={BUILDER_NODE_ANIMATION_EASING_OPTIONS}
                      />
                    </div>
                  </>
                ) : null}
              </div>
              </div>
              </details>
            </div>
    </>
  );
}

/**
 * D4 — the SURFACE half: shadow, text shadow, background image/size/position/
 * repeat/clip, extra background layers, opacity.
 *
 * Two things changed here and nothing else:
 *
 *  1. It moved OUT of "Effects & motion" and INTO "Appearance". Shadow living
 *     in a collapsed "Effects" accordion is the audit's headline search
 *     failure — an operator looking for a drop shadow looks under Appearance,
 *     which is where the fill and the corners are.
 *  2. The "Surface & depth" <details> is GONE. It was the third of the three
 *     label-disguised disclosures #1199 flagged: a grey summary drawn exactly
 *     like the static field labels around it. Its children now render plainly
 *     as the tail of the Appearance group.
 */
export function SurfaceDepthBody({
  patchSelectedStandaloneStyle,
  selectedStandaloneViewportStyle,
  setOrToggleStandaloneStyle,
}: EffectsSurfaceSectionProps) {
  return (
    <>
            <div
              className="border-t pt-3"
              data-builder-node-style-control="surface"
              style={{ borderColor: CHROME.line }}
            >
              <div className="flex flex-col gap-2">
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="boxShadow"
              >
                {parseStyleTokenRef(selectedStandaloneViewportStyle?.boxShadow) ? null : (
                  <>
                    {/* D9 item 3, at its most literal: each tile WEARS the
                        box-shadow it offers, so "S / M / L" stops being a
                        guess about a value the operator cannot see. */}
                    <GlyphTiles
                      dataControl="boxShadowTiles"
                      label="Shadow"
                      searchTerms={["Shadow", "box shadow", "depth", "elevation"]}
                      options={shadowTileOptions(SHADOW_PRESETS)}
                      columns={4}
                      value={selectedStandaloneViewportStyle?.boxShadow ?? ""}
                      onChange={(next) => setOrToggleStandaloneStyle("boxShadow", next)}
                    />
                    <ShadowStackBuilder
                      value={selectedStandaloneViewportStyle?.boxShadow}
                      onChange={(next) => patchSelectedStandaloneStyle({ boxShadow: next })}
                    />
                  </>
                )}
                <ThemeBindRow
                  prop="boxShadow"
                  value={selectedStandaloneViewportStyle?.boxShadow}
                  onSet={(sentinel) =>
                    patchSelectedStandaloneStyle({ boxShadow: sentinel })
                  }
                  onDetach={() =>
                    patchSelectedStandaloneStyle({ boxShadow: undefined })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1"
                data-builder-node-style-control="textShadow"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Text shadow
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="0 2px 8px rgba(0,0,0,.4)"
                  value={selectedStandaloneViewportStyle?.textShadow ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      textShadow: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1"
                data-builder-node-style-control="backgroundImage"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Background image / gradient
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="url(…) or linear-gradient(…)"
                  value={selectedStandaloneViewportStyle?.backgroundImage ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      backgroundImage: e.target.value.trim() || undefined,
                    })
                  }
                />
                <GradientStopsBuilder
                  value={selectedStandaloneViewportStyle?.backgroundImage}
                  onChange={(next) => patchSelectedStandaloneStyle({ backgroundImage: next })}
                />
              </div>
              <div
                className="flex flex-col gap-1"
                data-builder-node-style-control="backgroundSize"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Background size
                </span>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="cover · contain · 100% auto"
                  value={selectedStandaloneViewportStyle?.backgroundSize ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      backgroundSize: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1"
                data-builder-node-style-control="backgroundPosition"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Background position
                </span>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { label: "Top", value: "center top" },
                      { label: "Center", value: "center center" },
                      { label: "Bottom", value: "center bottom" },
                      { label: "Left", value: "left center" },
                      { label: "Right", value: "right center" },
                    ] as const
                  ).map((preset) => {
                    const active =
                      (
                        selectedStandaloneViewportStyle?.backgroundPosition ?? ""
                      ).trim() === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() =>
                          patchSelectedStandaloneStyle({
                            backgroundPosition: preset.value,
                          })
                        }
                        className="cursor-pointer text-[11px]"
                        style={{
                          height: 24,
                          padding: "0 9px",
                          background: active ? CHROME.accent : CHROME.surface2,
                          border: `1px solid ${
                            active ? CHROME.accent : CHROME.controlBorder
                          }`,
                          borderRadius: 7,
                          color: active ? "#ffffff" : CHROME.ink,
                          fontWeight: active ? 600 : 400,
                          outline: "none",
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="center · top left · 50% 20%"
                  value={selectedStandaloneViewportStyle?.backgroundPosition ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      backgroundPosition: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="backgroundRepeat"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Background repeat
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.backgroundRepeat ?? ""}
                  onChange={(next) =>
                    setOrToggleStandaloneStyle("backgroundRepeat", next)
                  }
                  options={BUILDER_NODE_BG_REPEAT_OPTIONS}
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="backgroundClip"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Background clip
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.backgroundClip ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      backgroundClip: (next ||
                        undefined) as BuilderNodeStyleValue["backgroundClip"],
                    })
                  }
                  options={BUILDER_NODE_BG_CLIP_OPTIONS}
                />
                <span
                  className="text-[10px] leading-tight"
                  style={{ color: CHROME.muted }}
                >
                  Set a gradient or color background to show it through the text.
                </span>
              </div>
              {/* Wave 3 · 3C — layered background editor */}
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="backgroundLayers"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Layered backgrounds
                </span>
                <span
                  className="text-[10px] leading-tight"
                  style={{ color: CHROME.muted }}
                >
                  Stack gradients, images, and color overlays. Layers paint front-to-back (top = frontmost).
                </span>
                <BackgroundLayersEditor
                  layers={selectedStandaloneViewportStyle?.backgroundLayers}
                  blendMode={selectedStandaloneViewportStyle?.backgroundBlendMode}
                  onChange={(layers, blend) =>
                    patchSelectedStandaloneStyle({
                      backgroundLayers: layers.length > 0 ? layers : undefined,
                      backgroundBlendMode: blend,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1"
                data-builder-node-style-control="opacity"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Opacity
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    className="px-2"
                    style={{
                      height: 30,
                      width: 72,
                      fontSize: 12,
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    placeholder="100"
                    value={
                      typeof selectedStandaloneViewportStyle?.opacity === "number"
                        ? Math.round(selectedStandaloneViewportStyle.opacity * 100)
                        : ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      patchSelectedStandaloneStyle({
                        opacity:
                          raw === ""
                            ? undefined
                            : Math.max(0, Math.min(100, Number(raw))) / 100,
                      });
                    }}
                  />
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    %
                  </span>
                </div>
              </div>
              </div>
            </div>
    </>
  );
}
