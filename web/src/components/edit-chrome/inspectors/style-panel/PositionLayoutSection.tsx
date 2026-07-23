/**
 * StylePanel · PositionLayoutSection domain sub-section (W5-C1).
 *
 * Carved verbatim from style-panel.tsx's render body. Receives the exact
 * closure values the parent held, so runtime behavior is identical — same
 * controls, same values, same tree mutation on edit.
 */

import { NumberUnit, formatLength } from "../../kit/number-unit";
import { Segmented } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { InspectorGroup } from "../kit";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";
import { parseCssLength } from "./length-utils";
import { BUILDER_NODE_ALIGN_ITEMS_OPTIONS, BUILDER_NODE_ALIGN_SELF_OPTIONS, BUILDER_NODE_FLEX_WRAP_OPTIONS, BUILDER_NODE_GRID_AUTO_FLOW_OPTIONS, BUILDER_NODE_JUSTIFY_CONTENT_OPTIONS, BUILDER_NODE_OVERFLOW_OPTIONS, BUILDER_NODE_POSITION_OPTIONS, BUILDER_NODE_STICKY_ANCHOR_OPTIONS } from "./style-options";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import type { StandaloneSectionCtx } from "./section-types";

export type PositionLayoutSectionProps = Pick<
  StandaloneSectionCtx,
  "patchSelectedStandaloneStyle" | "selectedStandaloneStyleNode" | "selectedStandaloneViewportStyle" | "selectedViewport"
>;

export function PositionLayoutSection({
  patchSelectedStandaloneStyle,
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  selectedViewport,
}: PositionLayoutSectionProps) {
  return (
            <InspectorGroup
              title="Position & layout"
              collapsible
              advanced
              storageKey={`style-panel:position:${selectedStandaloneStyleNode.kind}`}
              defaultOpen={false}
            >
            <div
              className="border-t pt-3"
              data-builder-node-style-control="position"
              style={{ borderColor: CHROME.line }}
            >
              <details>
                <summary className="flex items-center justify-between select-none" style={{ cursor: "pointer", outline: "none", listStyle: "none" }}>
                  <span className={FIELD_LABEL}>Position</span>
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                </summary>
              <div className="flex flex-col gap-2 mt-2">
              <Segmented
                fullWidth
                compact
                value={selectedStandaloneViewportStyle?.position ?? ""}
                onChange={(next) =>
                  patchSelectedStandaloneStyle({
                    position: (next || undefined) as BuilderNodeStyleValue["position"],
                  })
                }
                options={BUILDER_NODE_POSITION_OPTIONS}
              />
              {/* Wave 6B (#23) — sticky pinning convenience. Visible when the node
                  is sticky (explicit position OR the anchor itself). Picks the
                  edge to pin to + the offset; the renderer writes position:sticky
                  + the inset for you (raw Top/Bottom below still win). */}
              {selectedStandaloneViewportStyle?.position === "sticky" ||
              selectedStandaloneViewportStyle?.stickyAnchor ? (
                <div
                  className="flex flex-col gap-2 rounded-md p-2"
                  data-builder-node-style-control="stickyAnchor"
                  style={{ background: CHROME.surface2, border: `1px solid ${CHROME.line}` }}
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Pin to edge
                  </span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.stickyAnchor ?? ""}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        stickyAnchor: (next || undefined) as BuilderNodeStyleValue["stickyAnchor"],
                      })
                    }
                    options={BUILDER_NODE_STICKY_ANCHOR_OPTIONS}
                  />
                  {selectedStandaloneViewportStyle?.stickyAnchor ? (
                    <div
                      className="flex flex-col gap-1"
                      data-builder-node-style-control="stickyOffset"
                    >
                      <span className="text-[11px]" style={{ color: CHROME.muted }}>
                        Offset from edge
                      </span>
                      <NumberUnit
                        units={["px", "%", "rem", "vh", "vw"]}
                        defaultUnit="px"
                        placeholder="0"
                        value={parseCssLength(selectedStandaloneViewportStyle?.stickyOffset)}
                        onChange={(next) =>
                          patchSelectedStandaloneStyle({
                            stickyOffset: next ? formatLength(next) : undefined,
                          })
                        }
                      />
                    </div>
                  ) : null}
                  <span className="text-[10px] leading-snug" style={{ color: CHROME.muted }}>
                    The block scrolls normally, then sticks to the{" "}
                    {selectedStandaloneViewportStyle?.stickyAnchor ?? "chosen"} edge
                    of its scroll area. Great for a sticky sub-nav or sidebar.
                  </span>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Top
                  </span>
                  <NumberUnit
                    units={["px", "%", "rem", "vh", "vw"]}
                    defaultUnit="px"
                    placeholder="Auto"
                    value={parseCssLength(selectedStandaloneViewportStyle?.top)}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        top: next ? formatLength(next) : undefined,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Right
                  </span>
                  <NumberUnit
                    units={["px", "%", "rem", "vh", "vw"]}
                    defaultUnit="px"
                    placeholder="Auto"
                    value={parseCssLength(selectedStandaloneViewportStyle?.right)}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        right: next ? formatLength(next) : undefined,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Bottom
                  </span>
                  <NumberUnit
                    units={["px", "%", "rem", "vh", "vw"]}
                    defaultUnit="px"
                    placeholder="Auto"
                    value={parseCssLength(selectedStandaloneViewportStyle?.bottom)}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        bottom: next ? formatLength(next) : undefined,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Left
                  </span>
                  <NumberUnit
                    units={["px", "%", "rem", "vh", "vw"]}
                    defaultUnit="px"
                    placeholder="Auto"
                    value={parseCssLength(selectedStandaloneViewportStyle?.left)}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        left: next ? formatLength(next) : undefined,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="zIndex"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Z-index
                  </span>
                  <input
                    type="number"
                    step={1}
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
                    placeholder="Auto"
                    value={
                      typeof selectedStandaloneViewportStyle?.zIndex === "number"
                        ? selectedStandaloneViewportStyle.zIndex
                        : ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = Number(raw);
                      patchSelectedStandaloneStyle({
                        zIndex:
                          raw === "" || !Number.isFinite(n)
                            ? undefined
                            : Math.max(-999, Math.min(999, Math.trunc(n))),
                      });
                    }}
                  />
                </div>
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="overflow"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Overflow
                  </span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.overflow ?? ""}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        overflow: (next || undefined) as BuilderNodeStyleValue["overflow"],
                      })
                    }
                    options={BUILDER_NODE_OVERFLOW_OPTIONS}
                  />
                </div>
              </div>
              </div>
              </details>
            </div>

            <div
              className="border-t pt-3"
              data-builder-node-style-control="transform"
              style={{ borderColor: CHROME.line }}
            >
              <details>
                <summary className="flex items-center justify-between select-none" style={{ cursor: "pointer", outline: "none", listStyle: "none" }}>
                  <span className={FIELD_LABEL}>Transform</span>
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                </summary>
              <div className="flex flex-col gap-2 mt-2">
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="rotate"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Rotate °
                  </span>
                  <input
                    type="number"
                    step={1}
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
                    placeholder="0"
                    value={
                      Number.isFinite(
                        Number.parseFloat(selectedStandaloneViewportStyle?.rotate ?? ""),
                      )
                        ? Number.parseFloat(selectedStandaloneViewportStyle?.rotate ?? "")
                        : ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = Number(raw);
                      patchSelectedStandaloneStyle({
                        rotate:
                          raw === "" || !Number.isFinite(n) ? undefined : `${n}deg`,
                      });
                    }}
                  />
                </div>
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="scale"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Scale %
                  </span>
                  <input
                    type="number"
                    step={5}
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
                    placeholder="100"
                    value={
                      Number.isFinite(Number(selectedStandaloneViewportStyle?.scale))
                        ? Math.round(Number(selectedStandaloneViewportStyle?.scale) * 100)
                        : ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = Number(raw);
                      patchSelectedStandaloneStyle({
                        scale:
                          raw === "" || !Number.isFinite(n)
                            ? undefined
                            : String(n / 100),
                      });
                    }}
                  />
                </div>
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="translate"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Move X Y
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
                    placeholder="10px -8px"
                    value={selectedStandaloneViewportStyle?.translate ?? ""}
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        translate: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="transformOrigin"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Pivot
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
                    placeholder="center"
                    value={selectedStandaloneViewportStyle?.transformOrigin ?? ""}
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        transformOrigin: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
              </div>
              </div>
              </details>
            </div>

            <div
              className="border-t pt-3"
              data-builder-node-style-control="selfLayout"
              style={{ borderColor: CHROME.line }}
            >
              <details>
                <summary className="flex items-center justify-between select-none" style={{ cursor: "pointer", outline: "none", listStyle: "none" }}>
                  <span className={FIELD_LABEL}>Layout in parent</span>
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                </summary>
              <div className="flex flex-col gap-2 mt-2">
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="alignSelf"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Self-align
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.alignSelf ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      alignSelf: (next || undefined) as BuilderNodeStyleValue["alignSelf"],
                    })
                  }
                  options={BUILDER_NODE_ALIGN_SELF_OPTIONS}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="flexGrow"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Grow
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
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
                    placeholder="0"
                    value={
                      typeof selectedStandaloneViewportStyle?.flexGrow === "number"
                        ? selectedStandaloneViewportStyle.flexGrow
                        : ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = Number(raw);
                      patchSelectedStandaloneStyle({
                        flexGrow:
                          raw === "" || !Number.isFinite(n)
                            ? undefined
                            : Math.max(0, Math.min(999, n)),
                      });
                    }}
                  />
                </div>
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="flexShrink"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Shrink
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
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
                    placeholder="1"
                    value={
                      typeof selectedStandaloneViewportStyle?.flexShrink === "number"
                        ? selectedStandaloneViewportStyle.flexShrink
                        : ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = Number(raw);
                      patchSelectedStandaloneStyle({
                        flexShrink:
                          raw === "" || !Number.isFinite(n)
                            ? undefined
                            : Math.max(0, Math.min(999, n)),
                      });
                    }}
                  />
                </div>
              </div>
              <div
                className="flex flex-col gap-1"
                data-builder-node-style-control="flexBasis"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Basis
                </span>
                <NumberUnit
                  units={["px", "%", "rem", "vw", "vh"]}
                  defaultUnit="px"
                  placeholder="Auto"
                  value={parseCssLength(selectedStandaloneViewportStyle?.flexBasis)}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      flexBasis: next ? formatLength(next) : undefined,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="gridColumn"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Grid col
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
                    placeholder="span 2"
                    value={selectedStandaloneViewportStyle?.gridColumn ?? ""}
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        gridColumn: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
                <div
                  className="flex flex-col gap-1"
                  data-builder-node-style-control="gridRow"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Grid row
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
                    placeholder="1 / 3"
                    value={selectedStandaloneViewportStyle?.gridRow ?? ""}
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        gridRow: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
              </div>
              <div
                className="flex flex-col gap-1"
                data-builder-node-style-control="order"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Order
                </span>
                <input
                  type="number"
                  step={1}
                  min={-999}
                  max={999}
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="Auto"
                  value={
                    typeof selectedStandaloneViewportStyle?.order === "number"
                      ? selectedStandaloneViewportStyle.order
                      : ""
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = Number(raw);
                    patchSelectedStandaloneStyle({
                      order:
                        raw === "" || !Number.isFinite(n)
                          ? undefined
                          : Math.max(-999, Math.min(999, Math.round(n))),
                    });
                  }}
                />
                <span className="text-[10.5px]" style={{ color: CHROME.muted }}>
                  {selectedViewport === "desktop"
                    ? "Reorders among siblings (lower first). Only inside a flex/grid parent."
                    : `Reorders on ${selectedViewport} without moving in the layout. Flex/grid parent only.`}
                </span>
              </div>
              </div>
              </details>
            </div>

            <div
              className="border-t pt-3"
              data-builder-node-style-control="childLayout"
              style={{ borderColor: CHROME.line }}
            >
              <details>
                <summary className="flex items-center justify-between select-none" style={{ cursor: "pointer", outline: "none", listStyle: "none" }}>
                  <span className={FIELD_LABEL}>Layout (children)</span>
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                </summary>
              <div className="flex flex-col gap-2 mt-2">
              <span className="text-[11px]" style={{ color: CHROME.muted }}>
                Distributes this box&apos;s own children, works on row / grid
                containers (container, split, card, CTA group).
              </span>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="justifyContent"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Main axis (justify)
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.justifyContent ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      justifyContent: (next || undefined) as BuilderNodeStyleValue["justifyContent"],
                    })
                  }
                  options={BUILDER_NODE_JUSTIFY_CONTENT_OPTIONS}
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="alignItems"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Cross axis (align)
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.alignItems ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      alignItems: (next || undefined) as BuilderNodeStyleValue["alignItems"],
                    })
                  }
                  options={BUILDER_NODE_ALIGN_ITEMS_OPTIONS}
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="flexWrap"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Wrap
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.flexWrap ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      flexWrap: (next || undefined) as BuilderNodeStyleValue["flexWrap"],
                    })
                  }
                  options={BUILDER_NODE_FLEX_WRAP_OPTIONS}
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="gridTemplateColumns"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Grid columns (grid layout)
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
                  placeholder="2fr 1fr · repeat(auto-fit,minmax(200px,1fr))"
                  value={selectedStandaloneViewportStyle?.gridTemplateColumns ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      gridTemplateColumns: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="gridTemplateRows"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Grid rows
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
                  placeholder="auto 1fr"
                  value={selectedStandaloneViewportStyle?.gridTemplateRows ?? ""}
                  onChange={(e) =>
                    patchSelectedStandaloneStyle({
                      gridTemplateRows: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="gridAutoFlow"
              >
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  Auto-flow
                </span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.gridAutoFlow ?? ""}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      gridAutoFlow: (next || undefined) as BuilderNodeStyleValue["gridAutoFlow"],
                    })
                  }
                  options={BUILDER_NODE_GRID_AUTO_FLOW_OPTIONS}
                />
              </div>
              </div>
              </details>
            </div>
            </InspectorGroup>
  );
}
