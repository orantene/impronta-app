/**
 * StylePanel · Dimensions domain sub-section (W5-C1).
 *
 * Carved verbatim from style-panel.tsx's render body. Receives the exact
 * closure values the parent held (node, resolved viewport style, and the two
 * style-patch helpers), so runtime behavior is identical — same controls,
 * same values, same tree mutation on edit.
 */

import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import { InspectorGroup, SegmentedField, NumberField } from "../kit";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";
import { CHROME } from "../../kit/tokens";
import { formatLength } from "../../kit/number-unit";
import { BUILDER_NODE_WIDTH_OPTIONS } from "./style-options";
import { parseCssLength } from "./length-utils";
import type { StandaloneStyleNode } from "./section-types";

export interface DimensionsSectionProps {
  selectedStandaloneStyleNode: StandaloneStyleNode;
  selectedStandaloneViewportStyle: BuilderNodeStyleValue | undefined;
  setOrToggleStandaloneStyle: (
    key: keyof BuilderNodeStyleValue,
    next: string,
  ) => void;
  patchSelectedStandaloneStyle: (patch: Partial<BuilderNodeStyleValue>) => void;
}

export function DimensionsSection({
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  setOrToggleStandaloneStyle,
  patchSelectedStandaloneStyle,
}: DimensionsSectionProps) {
  return (
            <InspectorGroup
              title="Dimensions"
              collapsible
              storageKey={`style-panel:dimensions:${selectedStandaloneStyleNode.kind}`}
              defaultOpen={false}
              // D5 — field-level search keywords (see InspectorGroup).
              searchTerms={[
                "width",
                "max width",
                "min width",
                "height",
                "max height",
                "min height",
                "exact size",
              ]}
            >
            <SegmentedField
              dataControl="maxWidth"
              label="Max width (preset)"
              value={selectedStandaloneViewportStyle?.maxWidth ?? ""}
              onChange={(next) => setOrToggleStandaloneStyle("maxWidth", next)}
              options={BUILDER_NODE_WIDTH_OPTIONS}
            />

            <details
              open={Boolean(
                selectedStandaloneViewportStyle?.width ||
                  selectedStandaloneViewportStyle?.height ||
                  selectedStandaloneViewportStyle?.minHeight ||
                  selectedStandaloneViewportStyle?.minWidth ||
                  selectedStandaloneViewportStyle?.maxWidthFree ||
                  selectedStandaloneViewportStyle?.maxHeight,
              )}
              data-builder-node-style-control="dimensions"
            >
              <summary
                className="flex items-center justify-between select-none"
                style={{ cursor: "pointer", outline: "none", listStyle: "none" }}
              >
                <span className={FIELD_LABEL}>Exact size</span>
                <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
              </summary>
              <div className="mt-2 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Exact width"
                  units={["px", "%", "vw", "rem"]}
                  defaultUnit="px"
                  placeholder="Auto"
                  value={parseCssLength(selectedStandaloneViewportStyle?.width)}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      width: next ? formatLength(next) : undefined,
                    })
                  }
                />
                <NumberField
                  label="Height"
                  units={["px", "vh", "%", "rem"]}
                  defaultUnit="px"
                  placeholder="Auto"
                  value={parseCssLength(selectedStandaloneViewportStyle?.height)}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      height: next ? formatLength(next) : undefined,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Min height"
                  units={["px", "vh", "%", "rem"]}
                  defaultUnit="px"
                  placeholder="Auto"
                  value={parseCssLength(selectedStandaloneViewportStyle?.minHeight)}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      minHeight: next ? formatLength(next) : undefined,
                    })
                  }
                />
                <NumberField
                  label="Min width"
                  units={["px", "%", "vw", "rem"]}
                  defaultUnit="px"
                  placeholder="Auto"
                  value={parseCssLength(selectedStandaloneViewportStyle?.minWidth)}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      minWidth: next ? formatLength(next) : undefined,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Max width"
                  units={["px", "%", "vw", "rem"]}
                  defaultUnit="px"
                  placeholder="Auto"
                  value={parseCssLength(selectedStandaloneViewportStyle?.maxWidthFree)}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      maxWidthFree: next ? formatLength(next) : undefined,
                    })
                  }
                />
                <NumberField
                  label="Max height"
                  units={["px", "vh", "%", "rem"]}
                  defaultUnit="px"
                  placeholder="Auto"
                  value={parseCssLength(selectedStandaloneViewportStyle?.maxHeight)}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      maxHeight: next ? formatLength(next) : undefined,
                    })
                  }
                />
              </div>
              </div>
            </details>
            </InspectorGroup>
  );
}
