/**
 * StylePanel · Dimensions domain sub-section (W5-C1).
 *
 * Carved verbatim from style-panel.tsx's render body. Receives the exact
 * closure values the parent held (node, resolved viewport style, and the two
 * style-patch helpers), so runtime behavior is identical — same controls,
 * same values, same tree mutation on edit.
 */

import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import { InspectorGroup, NumberField } from "../kit";
import { MAX_WIDTH_PRESETS, PresetNumberRow } from "../field-kit";
import { formatLength } from "../../kit/number-unit";
import { parseCssLength } from "./length-utils";
import { twoSlotFieldValue, twoSlotPatch } from "./field-value-bridge";
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
            {/* D9 + the mockup's annotation D: "Exact size" is no longer a grey
                label you must know to click. Max width's chips carry their real
                px (Read = 680) and the exact input sits beside them; the
                remaining width/height pairs render as plain visible fields. */}
            <PresetNumberRow
              dataControl="maxWidth"
              label="Max width"
              searchTerms={["Max width", "measure", "content width", "reading width"]}
              presets={MAX_WIDTH_PRESETS}
              units={["px", "%", "vw", "rem"]}
              placeholder="Auto"
              value={twoSlotFieldValue(
                selectedStandaloneViewportStyle?.maxWidth,
                selectedStandaloneViewportStyle?.maxWidthFree,
              )}
              onChange={(next) => {
                const patch = twoSlotPatch(next);
                patchSelectedStandaloneStyle({
                  maxWidth: patch.token as BuilderNodeStyleValue["maxWidth"],
                  maxWidthFree: patch.free,
                });
              }}
            />

            <div
              data-builder-node-style-control="dimensions"
              className="flex flex-col gap-2"
            >
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
                {/* "Max width" is NOT repeated here: it is the exact input on
                    the preset row above, writing the same `maxWidthFree` key.
                    Two fields for one value is how a panel teaches an operator
                    that saving does not work. */}
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
            </InspectorGroup>
  );
}
