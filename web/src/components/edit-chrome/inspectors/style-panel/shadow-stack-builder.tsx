"use client";

/**
 * ShadowStackBuilder — the multi-layer box-shadow editor.
 *
 * Replaces the old single-layer `ShadowBuilder`: real depth is nearly always
 * 2-3 stacked shadows (the S/M/L preset tiles above this control already
 * store comma-separated pairs, which the old builder could not even parse).
 *
 * Honesty rules, pinned by visual-effect-wiring.test.tsx:
 *  - Rendering NEVER emits a patch: a hand-authored value is shown, not
 *    rewritten. Only a user gesture writes.
 *  - Each layer keeps its exact source text; editing layer N recomposes only
 *    layer N, every other layer round-trips byte-identical.
 *  - A layer the grammar cannot own (var(), color-mix mid-layer, …) is shown
 *    as its raw text in an editable text field instead of being flattened
 *    into sliders that would snap it to defaults.
 *  - A composed stack that would blow the 200-char save cap is NOT emitted:
 *    the add button stands down and a warning says why (a doomed patch would
 *    be dropped by save-side validation with no feedback at all).
 */

import { useState } from "react";
import { CHROME } from "../../kit/tokens";
import { useInspectorT } from "../kit/use-inspector-t";
import {
  composeShadowLayer,
  composeShadowStack,
  DEFAULT_SHADOW_LAYER,
  parseShadowStack,
  type ShadowLayer,
  type ShadowLayerParts,
} from "./visual-effect-models";

const numInputStyle = {
  height: 28,
  width: "100%",
  fontSize: 12,
  textAlign: "center" as const,
  background: CHROME.surface2,
  border: `1px solid ${CHROME.controlBorder}`,
  borderRadius: 7,
  color: CHROME.ink,
  outline: "none",
};

const textInputStyle = {
  height: 28,
  width: "100%",
  fontSize: 12,
  background: CHROME.surface2,
  border: `1px solid ${CHROME.controlBorder}`,
  borderRadius: 7,
  color: CHROME.ink,
  outline: "none",
};

const ghostButtonStyle = {
  color: CHROME.muted,
  background: "transparent",
  border: "none",
  padding: "0 2px",
} as const;

export function ShadowStackBuilder({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const { t } = useInspectorT();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [overCap, setOverCap] = useState(false);

  const layers = parseShadowStack(value);

  function emit(next: ShadowLayer[]) {
    const composed = composeShadowStack(next);
    if (composed === null) {
      // Over the save cap — refuse loudly instead of letting the save drop it.
      setOverCap(true);
      return;
    }
    setOverCap(false);
    onChange(composed);
  }

  function patchLayer(index: number, next: Partial<ShadowLayerParts>) {
    emit(
      layers.map((layer, i) => {
        if (i !== index) return layer;
        const parsed = { ...(layer.parsed ?? DEFAULT_SHADOW_LAYER), ...next };
        return { css: composeShadowLayer(parsed), parsed };
      }),
    );
  }

  function setLayerRaw(index: number, css: string) {
    // Re-parse on the fly so a corrected raw value graduates back to controls.
    emit(
      layers.map((layer, i) =>
        i === index ? { css, parsed: null } : layer,
      ),
    );
  }

  function addLayer() {
    const parsed = { ...DEFAULT_SHADOW_LAYER };
    emit([...layers, { css: composeShadowLayer(parsed), parsed }]);
    setExpandedIndex(layers.length);
  }

  function removeLayer(index: number) {
    emit(layers.filter((_, i) => i !== index));
    setExpandedIndex(null);
  }

  function moveLayer(from: number, to: number) {
    if (to < 0 || to >= layers.length) return;
    const next = [...layers];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    emit(next);
  }

  return (
    <div className="flex flex-col gap-1.5" data-builder-shadow-stack="">
      {layers.map((layer, i) => {
        const isOpen = expandedIndex === i;
        return (
          <div
            key={i}
            className="rounded-lg overflow-hidden"
            data-builder-shadow-layer={i}
            style={{ border: `1px solid ${CHROME.line}`, background: CHROME.surface }}
          >
            <div className="flex items-center gap-2 p-1.5">
              {/* The swatch WEARS the layer it stands for. */}
              <div
                className="h-5 w-5 shrink-0 rounded"
                style={{
                  background: "#fff",
                  border: `1px solid ${CHROME.controlBorder}`,
                  boxShadow: layer.css,
                }}
                aria-hidden
              />
              <span
                className="flex-1 truncate text-[10px]"
                style={{ color: CHROME.ink, fontFamily: "monospace" }}
                title={layer.css}
              >
                {layer.css}
              </span>
              {i > 0 ? (
                <button
                  type="button"
                  data-builder-shadow-layer-up={i}
                  className="cursor-pointer rounded text-[11px] leading-none"
                  style={ghostButtonStyle}
                  onClick={() => moveLayer(i, i - 1)}
                  aria-label={`Move shadow layer ${i + 1} up`}
                >
                  ↑
                </button>
              ) : null}
              {i < layers.length - 1 ? (
                <button
                  type="button"
                  data-builder-shadow-layer-down={i}
                  className="cursor-pointer rounded text-[11px] leading-none"
                  style={ghostButtonStyle}
                  onClick={() => moveLayer(i, i + 1)}
                  aria-label={`Move shadow layer ${i + 1} down`}
                >
                  ↓
                </button>
              ) : null}
              <button
                type="button"
                data-builder-shadow-layer-toggle={i}
                className="cursor-pointer rounded text-[11px] leading-none font-semibold"
                style={{ ...ghostButtonStyle, color: CHROME.ink }}
                onClick={() => setExpandedIndex(isOpen ? null : i)}
                aria-label={isOpen ? `Collapse shadow layer ${i + 1}` : `Edit shadow layer ${i + 1}`}
              >
                {isOpen ? "−" : "+"}
              </button>
              <button
                type="button"
                data-builder-shadow-layer-remove={i}
                className="cursor-pointer rounded text-[11px] leading-none"
                style={ghostButtonStyle}
                onClick={() => removeLayer(i)}
                aria-label={`Remove shadow layer ${i + 1}`}
              >
                ×
              </button>
            </div>
            {isOpen ? (
              layer.parsed ? (
                <div
                  className="flex flex-col gap-2 border-t p-2"
                  style={{ borderColor: CHROME.line }}
                >
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["x", "y", "blur", "spread"] as const).map((k) => (
                      <div key={k} className="flex flex-col items-center gap-1">
                        <span className="text-[10px]" style={{ color: CHROME.muted }}>
                          {/* "Spread" stays untranslated: the one EN-keyed ES
                              map already owns that word for the media panel's
                              two-page spread, and a second meaning cannot
                              coexist. CSS-adjacent, so it reads fine. */}
                          {k === "x" ? "X" : k === "y" ? "Y" : k === "blur" ? t("Blur") : "Spread"}
                        </span>
                        <input
                          type="number"
                          data-builder-shadow-field={k}
                          style={numInputStyle}
                          value={layer.parsed[k]}
                          onChange={(e) =>
                            patchLayer(i, { [k]: Math.round(Number(e.target.value) || 0) })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      data-builder-shadow-field="color"
                      style={textInputStyle}
                      placeholder="rgba(0,0,0,0.18)"
                      value={layer.parsed.color}
                      onChange={(e) =>
                        patchLayer(i, { color: e.target.value || DEFAULT_SHADOW_LAYER.color })
                      }
                    />
                    <label
                      className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px]"
                      style={{ color: CHROME.muted }}
                    >
                      <input
                        type="checkbox"
                        data-builder-shadow-field="inset"
                        checked={layer.parsed.inset}
                        onChange={(e) => patchLayer(i, { inset: e.target.checked })}
                      />
                      {t("Inset")}
                    </label>
                  </div>
                </div>
              ) : (
                <div
                  className="flex flex-col gap-1 border-t p-2"
                  style={{ borderColor: CHROME.line }}
                >
                  <span className="text-[10px]" style={{ color: CHROME.muted }}>
                    {t("Custom shadow, kept exactly as written.")}
                  </span>
                  <input
                    type="text"
                    data-builder-shadow-field="raw"
                    style={textInputStyle}
                    value={layer.css}
                    onChange={(e) => setLayerRaw(i, e.target.value)}
                  />
                </div>
              )
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        data-builder-shadow-layer-add=""
        className="cursor-pointer rounded-md py-1 text-[11px] font-semibold"
        style={{
          background: CHROME.surface2,
          color: CHROME.ink,
          border: `1px solid ${CHROME.controlBorder}`,
        }}
        onClick={addLayer}
      >
        {t("+ Add shadow layer")}
      </button>
      {overCap ? (
        <span
          className="text-[10px] leading-tight"
          data-builder-shadow-stack-overcap=""
          style={{ color: CHROME.rose }}
        >
          {t("That is too long to save. Remove a layer or shorten a color.")}
        </span>
      ) : null}
    </div>
  );
}
