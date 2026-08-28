/**
 * StylePanel - the TRANSFORM block, carved out of PositionLayoutSection.
 *
 * WHY IT IS ITS OWN FILE. The stack-first pass moved these four fields to the
 * BOTTOM of the Advanced group, below the two blocks that decide how a box
 * actually arranges its children, and gave them one line saying what they are:
 * paint applied after the layout has already run. Rotate, scale, a nudge and a
 * pivot are an escape, not a layout primitive, and reading them at the same
 * visual weight as flow and wrap is how an operator ends up nudging a box by
 * 8px to fix a gap the gap control owns.
 *
 * The extraction is the mechanical half of the same move: the reorder plus the
 * explanatory line pushed the parent past its 800-line cap, and this project
 * extracts rather than raising a budget.
 *
 * Behaviour is unchanged. Same fields, same values, same patches, same
 * collapsed <details>.
 */

import { CHROME } from "../../kit/tokens";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";
import type { PositionLayoutSectionProps } from "./PositionLayoutSection";

export type TransformFieldsProps = Pick<
  PositionLayoutSectionProps,
  "patchSelectedStandaloneStyle" | "selectedStandaloneViewportStyle"
>;

export function TransformFields({
  patchSelectedStandaloneStyle,
  selectedStandaloneViewportStyle,
}: TransformFieldsProps) {
  return (
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
              <span className="text-[11px]" style={{ color: CHROME.muted }}>
                A visual offset painted after the layout runs. It moves what the
                box looks like, never where it sits in the stack, so use the
                controls above to change how this block is arranged.
              </span>
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
  );
}
