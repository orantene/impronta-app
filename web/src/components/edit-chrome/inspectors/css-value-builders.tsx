"use client";

import { useState } from "react";
import { Segmented, type SegmentedOption } from "../kit/segmented";
import { CHROME } from "../kit/tokens";
import { ColorSwatchButton } from "./color-swatch-button";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node/types";

/**
 * Visual CSS-value builders — compact, STATELESS editors that compose a CSS
 * string into an existing free-text style field (boxShadow / backgroundImage).
 *
 * Stateless by design: each render parses the current string into parts (with
 * sane defaults when absent or unparseable) and each control writes back the
 * re-composed string. No local state means no stale-sync bug when the selection
 * changes — the raw text field upstream stays the source of truth, so a
 * power-user's hand-written value is never silently clobbered until they touch
 * a control here.
 */

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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px]" style={{ color: CHROME.muted }}>
      {children}
    </span>
  );
}

// ── Multi-stop gradient builder (Wave 3 · 3C; conic + reorder 2026-08-28) ────
//
// The old two-stop `GradientBuilder` and single-layer `ShadowBuilder` that
// lived here are gone: `GradientStopsBuilder` below parses every value the
// two-stop builder ever wrote, and the shadow surface moved to
// `shadow-stack-builder.tsx` (multi-layer, comma-aware, verbatim-preserving).

export interface GradientStop {
  color: string;
  position?: number; // 0–100 percent; undefined = even distribution
}

export interface GradientStopsParts {
  kind: "linear" | "radial" | "conic";
  angle: number;
  stops: GradientStop[];
}

/** Keep composed gradients comfortably inside the 500-char backgroundImage cap. */
const MAX_GRADIENT_STOPS = 8;

const GRADIENT_STOPS_DEFAULTS: GradientStopsParts = {
  kind: "linear",
  angle: 135,
  stops: [
    { color: "#6366f1", position: 0 },
    { color: "#ec4899", position: 100 },
  ],
};

const GRADIENT_STOPS_KIND_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "linear", label: "Linear" },
  { value: "radial", label: "Radial" },
  { value: "conic", label: "Conic" },
];

function stopCss(stop: GradientStop): string {
  return stop.position !== undefined
    ? `${stop.color} ${stop.position}%`
    : stop.color;
}

export function composeGradientStops(p: GradientStopsParts): string {
  const stopList = p.stops.map(stopCss).join(", ");
  if (p.kind === "linear") return `linear-gradient(${p.angle}deg, ${stopList})`;
  if (p.kind === "conic") return `conic-gradient(from ${p.angle}deg, ${stopList})`;
  return `radial-gradient(circle, ${stopList})`;
}

function parseGradientStops(value: string | undefined): GradientStopsParts | null {
  if (!value) return null;
  const trimmed = value.trim();
  // linear-gradient(Ndeg, ...)
  const linMatch = trimmed.match(/^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*(.+)\s*\)$/);
  if (linMatch) {
    const stops = parseStopList(linMatch[2] ?? "");
    if (!stops) return null;
    return { kind: "linear", angle: Number(linMatch[1]), stops };
  }
  // radial-gradient(circle, ...)
  const radMatch = trimmed.match(/^radial-gradient\(\s*circle\s*,\s*(.+)\s*\)$/);
  if (radMatch) {
    const stops = parseStopList(radMatch[1] ?? "");
    if (!stops) return null;
    return { kind: "radial", angle: 135, stops };
  }
  // conic-gradient(from Ndeg, ...)
  const conMatch = trimmed.match(/^conic-gradient\(\s*from\s+(-?\d+(?:\.\d+)?)deg\s*,\s*(.+)\s*\)$/);
  if (conMatch) {
    const stops = parseStopList(conMatch[2] ?? "");
    if (!stops) return null;
    return { kind: "conic", angle: Number(conMatch[1]), stops };
  }
  return null;
}

// Parse a comma-separated stop list. Splits on top-level commas only (inside
// functional color values commas are inside parentheses).
function parseStopList(raw: string): GradientStop[] | null {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(") { depth++; current += ch; }
    else if (ch === ")") { depth--; current += ch; }
    else if (ch === "," && depth === 0) { parts.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  if (current.trim()) parts.push(current.trim());
  if (parts.length < 2) return null;
  return parts.map((part) => {
    const pctMatch = part.match(/^(.+?)\s+(-?\d+(?:\.\d+)?)%\s*$/);
    if (pctMatch) {
      return { color: pctMatch[1]?.trim() ?? part, position: Number(pctMatch[2]) };
    }
    return { color: part };
  });
}

/**
 * GradientStopsBuilder — multi-stop gradient editor for the background layers
 * system (Wave 3 · 3C). Stateless: composes to/from a CSS gradient string.
 * Supports linear + radial, angle control, add/remove stops, inline color
 * picker + text field per stop. Reuses the existing `GradientBuilder` style
 * conventions (numInputStyle / textInputStyle / CHROME tokens).
 */
export function GradientStopsBuilder({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string) => void;
}) {
  const parsed = parseGradientStops(value);
  const parts = parsed ?? GRADIENT_STOPS_DEFAULTS;

  function patch(next: Partial<GradientStopsParts>) {
    onChange(composeGradientStops({ ...parts, ...next }));
  }

  function patchStop(index: number, next: Partial<GradientStop>) {
    const stops = parts.stops.map((s, i) => (i === index ? { ...s, ...next } : s));
    patch({ stops });
  }

  function addStop() {
    if (parts.stops.length >= MAX_GRADIENT_STOPS) return;
    const stops = [
      ...parts.stops,
      { color: "#ffffff", position: 100 },
    ];
    patch({ stops });
  }

  function removeStop(index: number) {
    if (parts.stops.length <= 2) return;
    const stops = parts.stops.filter((_, i) => i !== index);
    patch({ stops });
  }

  function moveStop(from: number, to: number) {
    if (to < 0 || to >= parts.stops.length) return;
    const stops = [...parts.stops];
    const [item] = stops.splice(from, 1);
    if (item) stops.splice(to, 0, item);
    patch({ stops });
  }

  const previewCss = composeGradientStops(parts);

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-2"
      data-builder-gradient-stops-builder=""
      style={{ background: CHROME.surface, border: `1px solid ${CHROME.line}` }}
    >
      {/* Live preview strip */}
      <div
        className="h-8 w-full rounded-md"
        style={{ background: previewCss, border: `1px solid ${CHROME.line}` }}
        aria-hidden
      />
      {/* Type + angle row */}
      <Segmented
        fullWidth
        compact
        value={parts.kind}
        onChange={(next) =>
          patch({ kind: (next || "linear") as GradientStopsParts["kind"] })
        }
        options={GRADIENT_STOPS_KIND_OPTIONS}
      />
      {parts.kind !== "radial" ? (
        <div className="flex items-center gap-2">
          <Label>Angle</Label>
          <input
            type="number"
            data-builder-gradient-stops-field="angle"
            style={numInputStyle}
            value={parts.angle}
            onChange={(e) => patch({ angle: Math.round(Number(e.target.value) || 0) })}
          />
          <span className="text-[10px]" style={{ color: CHROME.muted }}>deg</span>
        </div>
      ) : null}
      {/* Stop list */}
      <div className="flex flex-col gap-1.5">
        {parts.stops.map((stop, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <ColorSwatchButton
              color={stop.color}
              dataAttr={["data-builder-gradient-stops-field", `stop-${i}-pick`]}
              ariaLabel={`Pick gradient stop ${i + 1} color`}
              onChange={(next) => patchStop(i, { color: next })}
            />
            <input
              type="text"
              data-builder-gradient-stops-field={`stop-${i}-color`}
              style={{ ...textInputStyle, flex: 1 }}
              placeholder="#hex or rgba()"
              value={stop.color}
              onChange={(e) => patchStop(i, { color: e.target.value || "#000000" })}
            />
            <input
              type="number"
              data-builder-gradient-stops-field={`stop-${i}-pos`}
              style={{ ...numInputStyle, width: 42 }}
              min={0}
              max={100}
              placeholder="%"
              value={stop.position ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                patchStop(i, {
                  position: raw === "" ? undefined : Math.min(100, Math.max(0, Number(raw))),
                });
              }}
            />
            <button
              type="button"
              data-builder-gradient-stops-move-up={i}
              disabled={i === 0}
              className="shrink-0 cursor-pointer rounded text-[11px] leading-none"
              style={{
                color: CHROME.muted,
                background: "transparent",
                border: "none",
                padding: "0 2px",
                opacity: i > 0 ? 1 : 0.3,
              }}
              onClick={() => moveStop(i, i - 1)}
              aria-label={`Move stop ${i + 1} up`}
            >
              ↑
            </button>
            <button
              type="button"
              data-builder-gradient-stops-move-down={i}
              disabled={i === parts.stops.length - 1}
              className="shrink-0 cursor-pointer rounded text-[11px] leading-none"
              style={{
                color: CHROME.muted,
                background: "transparent",
                border: "none",
                padding: "0 2px",
                opacity: i < parts.stops.length - 1 ? 1 : 0.3,
              }}
              onClick={() => moveStop(i, i + 1)}
              aria-label={`Move stop ${i + 1} down`}
            >
              ↓
            </button>
            <button
              type="button"
              data-builder-gradient-stops-remove={i}
              disabled={parts.stops.length <= 2}
              className="shrink-0 cursor-pointer rounded text-[11px] leading-none"
              style={{
                color: parts.stops.length > 2 ? CHROME.ink : CHROME.muted,
                background: "transparent",
                border: "none",
                padding: "0 2px",
                opacity: parts.stops.length > 2 ? 1 : 0.4,
              }}
              onClick={() => removeStop(i)}
              aria-label={`Remove stop ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        data-builder-gradient-stops-add=""
        disabled={parts.stops.length >= MAX_GRADIENT_STOPS}
        className="cursor-pointer rounded-md py-1 text-[11px] font-semibold"
        style={{
          background: CHROME.surface2,
          color: CHROME.ink,
          border: `1px solid ${CHROME.controlBorder}`,
          opacity: parts.stops.length >= MAX_GRADIENT_STOPS ? 0.4 : 1,
        }}
        onClick={addStop}
      >
        + Add stop
      </button>
      {parsed === null ? (
        <button
          type="button"
          data-builder-gradient-stops-apply=""
          className="cursor-pointer rounded-md py-1 text-[11px] font-semibold"
          style={{ background: CHROME.blue, color: "#fff", border: "none" }}
          onClick={() => onChange(composeGradientStops(GRADIENT_STOPS_DEFAULTS))}
        >
          Apply gradient
        </button>
      ) : null}
    </div>
  );
}

// ── Background layer editor (Wave 3 · 3C) ─────────────────────────────────────

export type BackgroundLayer = NonNullable<BuilderNodeStyleValue["backgroundLayers"]>[number];

const BG_LAYER_TYPE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "gradient", label: "Gradient" },
  { value: "image", label: "Image" },
  { value: "color", label: "Color" },
];

const BLEND_MODE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" },
  { value: "soft-light", label: "Soft light" },
  { value: "hard-light", label: "Hard light" },
  { value: "color-dodge", label: "Dodge" },
  { value: "color-burn", label: "Burn" },
  { value: "difference", label: "Difference" },
  { value: "exclusion", label: "Exclusion" },
  { value: "hue", label: "Hue" },
  { value: "saturation", label: "Sat." },
  { value: "color", label: "Color" },
  { value: "luminosity", label: "Luminosity" },
];

const DEFAULT_GRADIENT_LAYER_VALUE = composeGradientStops(GRADIENT_STOPS_DEFAULTS);
const DEFAULT_COLOR_LAYER_VALUE = "rgba(0,0,0,0.4)";
const DEFAULT_IMAGE_LAYER_VALUE = "";

function layerPreview(layer: BackgroundLayer): string {
  if (layer.type === "gradient") return layer.value;
  if (layer.type === "color") return `linear-gradient(${layer.value},${layer.value})`;
  return layer.value
    ? `url(${layer.value}) center/cover no-repeat`
    : "repeating-linear-gradient(45deg,#ccc 0,#ccc 1px,#fff 1px,#fff 8px)";
}

/**
 * BackgroundLayersEditor — inspector for the `backgroundLayers` +
 * `backgroundBlendMode` fields (Wave 3 · 3C). Renders one collapsed row per
 * layer with an expand-in-place editor. Layers are ordered top→bottom (index 0
 * paints first / frontmost). Drag-to-reorder is out of scope for Wave 3.
 */
export function BackgroundLayersEditor({
  layers,
  blendMode,
  onChange,
}: {
  layers: BackgroundLayer[] | undefined;
  blendMode: string | undefined;
  onChange: (layers: BackgroundLayer[], blendMode: string | undefined) => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const activeLayers: BackgroundLayer[] = layers && layers.length > 0 ? layers : [];

  function patchLayer(index: number, next: Partial<BackgroundLayer>) {
    const next_ = activeLayers.map((l, i) => (i === index ? { ...l, ...next } : l));
    onChange(next_, blendMode);
  }

  function addLayer() {
    const newLayer: BackgroundLayer = { type: "gradient", value: DEFAULT_GRADIENT_LAYER_VALUE };
    const next = [...activeLayers, newLayer];
    onChange(next, blendMode);
    setExpandedIndex(next.length - 1);
  }

  function removeLayer(index: number) {
    const next = activeLayers.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [], blendMode);
    setExpandedIndex(null);
  }

  function moveLayer(from: number, to: number) {
    const next = [...activeLayers];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    onChange(next, blendMode);
  }

  return (
    <div className="flex flex-col gap-2">
      {activeLayers.map((layer, i) => {
        const isOpen = expandedIndex === i;
        const preview = layerPreview(layer);
        return (
          <div
            key={i}
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${CHROME.line}`, background: CHROME.surface }}
          >
            {/* Layer header row */}
            <div className="flex items-center gap-2 p-1.5">
              {/* Mini preview swatch */}
              <div
                className="h-6 w-6 shrink-0 rounded"
                style={{
                  background: preview,
                  border: `1px solid ${CHROME.controlBorder}`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                aria-hidden
              />
              <span
                className="flex-1 truncate text-[11px]"
                style={{ color: CHROME.ink }}
              >
                {layer.type === "gradient"
                  ? "Gradient"
                  : layer.type === "image"
                    ? "Image"
                    : "Color"}
              </span>
              {/* Up / Down reorder */}
              {i > 0 ? (
                <button
                  type="button"
                  className="cursor-pointer rounded text-[11px] leading-none"
                  style={{ color: CHROME.muted, background: "transparent", border: "none", padding: "0 2px" }}
                  onClick={() => moveLayer(i, i - 1)}
                  aria-label="Move layer up"
                >
                  ↑
                </button>
              ) : null}
              {i < activeLayers.length - 1 ? (
                <button
                  type="button"
                  className="cursor-pointer rounded text-[11px] leading-none"
                  style={{ color: CHROME.muted, background: "transparent", border: "none", padding: "0 2px" }}
                  onClick={() => moveLayer(i, i + 1)}
                  aria-label="Move layer down"
                >
                  ↓
                </button>
              ) : null}
              {/* Expand toggle */}
              <button
                type="button"
                className="cursor-pointer rounded text-[11px] leading-none font-semibold"
                style={{ color: CHROME.ink, background: "transparent", border: "none", padding: "0 2px" }}
                onClick={() => setExpandedIndex(isOpen ? null : i)}
                aria-label={isOpen ? "Collapse layer" : "Expand layer"}
              >
                {isOpen ? "−" : "+"}
              </button>
              {/* Remove */}
              <button
                type="button"
                className="cursor-pointer rounded text-[11px] leading-none"
                style={{ color: CHROME.muted, background: "transparent", border: "none", padding: "0 2px" }}
                onClick={() => removeLayer(i)}
                aria-label="Remove layer"
              >
                ×
              </button>
            </div>
            {/* Expanded editor */}
            {isOpen ? (
              <div className="flex flex-col gap-2 border-t p-2" style={{ borderColor: CHROME.line }}>
                <Segmented
                  fullWidth
                  compact
                  value={layer.type}
                  onChange={(next) => {
                    const type = (next || "gradient") as BackgroundLayer["type"];
                    const value =
                      type === "gradient"
                        ? DEFAULT_GRADIENT_LAYER_VALUE
                        : type === "color"
                          ? DEFAULT_COLOR_LAYER_VALUE
                          : DEFAULT_IMAGE_LAYER_VALUE;
                    patchLayer(i, { type, value });
                  }}
                  options={BG_LAYER_TYPE_OPTIONS}
                />
                {layer.type === "gradient" ? (
                  <GradientStopsBuilder
                    value={layer.value}
                    onChange={(v) => patchLayer(i, { value: v })}
                  />
                ) : layer.type === "color" ? (
                  <div className="flex items-center gap-2">
                    <ColorSwatchButton
                      color={layer.value}
                      ariaLabel={`Pick background layer ${i + 1} color`}
                      onChange={(next) => patchLayer(i, { value: next })}
                    />
                    <input
                      type="text"
                      style={textInputStyle}
                      placeholder="rgba(0,0,0,0.4)"
                      value={layer.value}
                      onChange={(e) => patchLayer(i, { value: e.target.value || DEFAULT_COLOR_LAYER_VALUE })}
                    />
                  </div>
                ) : (
                  /* image type */
                  <input
                    type="text"
                    style={textInputStyle}
                    placeholder="url(https://…)"
                    value={layer.value}
                    onChange={(e) => patchLayer(i, { value: e.target.value })}
                  />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        data-builder-bg-layer-add=""
        className="cursor-pointer rounded-md py-1 text-[11px] font-semibold"
        style={{ background: CHROME.surface2, color: CHROME.ink, border: `1px solid ${CHROME.controlBorder}` }}
        onClick={addLayer}
      >
        + Add layer
      </button>
      {/* Blend mode — shown once layers exist */}
      {activeLayers.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-[10px] shrink-0" style={{ color: CHROME.muted }}>
            Blend
          </span>
          <select
            value={blendMode ?? ""}
            onChange={(e) => onChange(activeLayers, e.target.value || undefined)}
            style={{
              flex: 1,
              height: 28,
              fontSize: 12,
              background: CHROME.surface2,
              border: `1px solid ${CHROME.controlBorder}`,
              borderRadius: 7,
              color: CHROME.ink,
              outline: "none",
            }}
          >
            {BLEND_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
