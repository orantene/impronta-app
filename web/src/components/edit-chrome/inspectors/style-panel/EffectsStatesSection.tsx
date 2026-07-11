/**
 * StylePanel · EffectsStatesSection — sub-section of Effects & motion (W5-C1 file-size split).
 *
 * Carved verbatim from EffectsSection so each file stays under the 800-line
 * budget. Renders a Fragment of the same sibling blocks that were direct
 * children of the Effects InspectorGroup, so runtime output is identical.
 */

import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import { Segmented } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";
import { StateStyleFields } from "../style-panel-state-style-fields";
import { BUILDER_NODE_BLEND_OPTIONS } from "./style-options";
import type { StandaloneSectionCtx } from "./section-types";

export type EffectsStatesSectionProps = Pick<
  StandaloneSectionCtx,
  "patchSelectedBaseStyle" | "patchSelectedHoverStyle" | "patchSelectedStandaloneStyle" | "patchSelectedStateStyle" | "selectedInteractionState" | "selectedStandaloneFullStyle" | "selectedStandaloneViewportStyle" | "setSelectedInteractionState"
>;

export function EffectsStatesSection({
  patchSelectedBaseStyle,
  patchSelectedHoverStyle,
  patchSelectedStandaloneStyle,
  patchSelectedStateStyle,
  selectedInteractionState,
  selectedStandaloneFullStyle,
  selectedStandaloneViewportStyle,
  setSelectedInteractionState,
}: EffectsStatesSectionProps) {
  return (
    <>
            <div
              className="border-t pt-3"
              data-builder-node-style-control="effects"
              style={{ borderColor: CHROME.line }}
            >
              <details>
                <summary className="flex items-center justify-between select-none" style={{ cursor: "pointer", outline: "none", listStyle: "none" }}>
                  <span className={FIELD_LABEL}>Effects</span>
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                </summary>
              <div className="flex flex-col gap-2 mt-2">
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="filter"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Filter
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
                  placeholder="blur(8px) grayscale(1)"
                  value={selectedStandaloneViewportStyle?.filter ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      filter: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="backdropFilter"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Backdrop
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
                  placeholder="blur(12px)"
                  value={selectedStandaloneViewportStyle?.backdropFilter ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      backdropFilter: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="mixBlendMode"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Blend
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.mixBlendMode ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      mixBlendMode: (next ||
                        undefined) as BuilderNodeStyleValue["mixBlendMode"],
                    })
                  }
                  options={BUILDER_NODE_BLEND_OPTIONS}
                />
              </div>
              </div>
              </details>
            </div>

            {/* ── Wave 3 · 3D Universal State Editor ── */}
            <div
              className="border-t pt-3"
              data-builder-node-style-control="stateStyles"
              style={{ borderColor: CHROME.line }}
            >
              <details>
                <summary className="flex items-center justify-between select-none" style={{ cursor: "pointer", outline: "none", listStyle: "none" }}>
                  <span className={FIELD_LABEL}>States</span>
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                </summary>
              <div className="flex flex-col gap-2 mt-2">
              {/* Transition (shared across all states) */}
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="transition"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Transition
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
                  placeholder="all .2s ease (auto when state set)"
                  value={selectedStandaloneFullStyle?.transition ?? ""}
                  onChange={(e) =>
                    patchSelectedBaseStyle({
                      transition: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              {/* State switcher — Hover / Focus / Active */}
              <div className="flex gap-1 rounded-md overflow-hidden" style={{ border: `1px solid ${CHROME.line}` }}>
                {(["default", "focus", "active"] as const).map((state) => {
                  const label = state === "default" ? "Hover" : state === "focus" ? "Focus" : "Active";
                  const hasValue =
                    state === "default"
                      ? Boolean(selectedStandaloneFullStyle?.hover && Object.values(selectedStandaloneFullStyle.hover).some(Boolean))
                      : state === "focus"
                        ? Boolean(selectedStandaloneFullStyle?.stateStyles?.focus && Object.values(selectedStandaloneFullStyle.stateStyles.focus).some(Boolean))
                        : Boolean(selectedStandaloneFullStyle?.stateStyles?.active && Object.values(selectedStandaloneFullStyle.stateStyles.active).some(Boolean));
                  return (
                    <button
                      key={state}
                      type="button"
                      onClick={() => setSelectedInteractionState(state)}
                      style={{
                        flex: 1,
                        height: 26,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        border: "none",
                        borderRadius: 0,
                        cursor: "pointer",
                        background: selectedInteractionState === state ? CHROME.ink : "transparent",
                        color: selectedInteractionState === state ? "#fff" : hasValue ? CHROME.accent : CHROME.muted,
                        position: "relative",
                      }}
                    >
                      {label}
                      {hasValue && selectedInteractionState !== state ? (
                        <span style={{ position: "absolute", top: 4, right: 4, width: 4, height: 4, borderRadius: "50%", background: CHROME.accent }} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {/* State-specific fields — same controls for all three states */}
              <StateStyleFields
                state={selectedInteractionState}
                hoverStyle={selectedStandaloneFullStyle?.hover}
                focusStyle={selectedStandaloneFullStyle?.stateStyles?.focus}
                activeStyle={selectedStandaloneFullStyle?.stateStyles?.active}
                onPatchHover={(patch) => patchSelectedHoverStyle(patch)}
                onPatchFocus={(patch) => patchSelectedStateStyle("focus", patch)}
                onPatchActive={(patch) => patchSelectedStateStyle("active", patch)}
                chromeMuted={CHROME.muted}
                chromeSurface2={CHROME.surface2}
                chromeControlBorder={CHROME.controlBorder}
                chromeInk={CHROME.ink}
              />
              </div>
              </details>
            </div>
    </>
  );
}
