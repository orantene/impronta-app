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

// ── Shadow ──────────────────────────────────────────────────────────────────

interface ShadowParts {
  inset: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

const SHADOW_DEFAULTS: ShadowParts = {
  inset: false,
  x: 0,
  y: 8,
  blur: 24,
  spread: 0,
  color: "rgba(0,0,0,0.18)",
};

function parseShadow(value: string | undefined): ShadowParts {
  if (!value) return SHADOW_DEFAULTS;
  const trimmed = value.trim();
  const inset = /^inset\b/.test(trimmed);
  const body = trimmed.replace(/^inset\s+/, "");
  // Pull the four leading lengths; whatever remains is the color.
  const lengthMatch = body.match(
    /^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s*(.*)$/,
  );
  if (!lengthMatch) return { ...SHADOW_DEFAULTS, inset };
  const [, x, y, blur, spread, color] = lengthMatch;
  return {
    inset,
    x: Number(x),
    y: Number(y),
    blur: Number(blur),
    spread: spread !== undefined ? Number(spread) : 0,
    color: color.trim() || SHADOW_DEFAULTS.color,
  };
}

function composeShadow(p: ShadowParts): string {
  return `${p.inset ? "inset " : ""}${p.x}px ${p.y}px ${p.blur}px ${p.spread}px ${p.color}`;
}

export function ShadowBuilder({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const parts = parseShadow(value);
  const patch = (next: Partial<ShadowParts>) =>
    onChange(composeShadow({ ...parts, ...next }));

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-2"
      data-builder-shadow-builder=""
      style={{ background: CHROME.surface, border: `1px solid ${CHROME.line}` }}
    >
      <div className="grid grid-cols-4 gap-1.5">
        {(["x", "y", "blur", "spread"] as const).map((k) => (
          <div key={k} className="flex flex-col items-center gap-1">
            <Label>{k === "x" ? "X" : k === "y" ? "Y" : k === "blur" ? "Blur" : "Spread"}</Label>
            <input
              type="number"
              data-builder-shadow-field={k}
              style={numInputStyle}
              value={parts[k]}
              onChange={(e) => patch({ [k]: Math.round(Number(e.target.value) || 0) })}
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
          value={parts.color}
          onChange={(e) => patch({ color: e.target.value || SHADOW_DEFAULTS.color })}
        />
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px]"
          style={{ color: CHROME.muted }}
        >
          <input
            type="checkbox"
            data-builder-shadow-field="inset"
            checked={parts.inset}
            onChange={(e) => patch({ inset: e.target.checked })}
          />
          Inset
        </label>
      </div>
    </div>
  );
}

// ── Gradient ──────────────────────────────────────────────────────────────────

interface GradientParts {
  kind: "linear" | "radial";
  angle: number;
  c1: string;
  c2: string;
}

const GRADIENT_DEFAULTS: GradientParts = {
  kind: "linear",
  angle: 180,
  c1: "#6366f1",
  c2: "#ec4899",
};

const GRADIENT_KIND_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "linear", label: "Linear" },
  { value: "radial", label: "Radial" },
];

function parseGradient(value: string | undefined): GradientParts | null {
  if (!value) return null;
  const trimmed = value.trim();
  const linear = trimmed.match(/^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/);
  if (linear) {
    return { kind: "linear", angle: Number(linear[1]), c1: linear[2], c2: linear[3] };
  }
  const radial = trimmed.match(/^radial-gradient\(\s*circle\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/);
  if (radial) {
    return { kind: "radial", angle: 180, c1: radial[1], c2: radial[2] };
  }
  return null;
}

function composeGradient(p: GradientParts): string {
  return p.kind === "linear"
    ? `linear-gradient(${p.angle}deg, ${p.c1}, ${p.c2})`
    : `radial-gradient(circle, ${p.c1}, ${p.c2})`;
}


export function GradientBuilder({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const parsed = parseGradient(value);
  // If the field holds a non-gradient (url(), unparseable), keep the builder
  // dormant on defaults — don't clobber until the user applies one.
  const parts = parsed ?? GRADIENT_DEFAULTS;
  const patch = (next: Partial<GradientParts>) =>
    onChange(composeGradient({ ...parts, ...next }));

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-2"
      data-builder-gradient-builder=""
      style={{ background: CHROME.surface, border: `1px solid ${CHROME.line}` }}
    >
      <div
        className="h-8 w-full rounded-md"
        style={{ background: composeGradient(parts), border: `1px solid ${CHROME.line}` }}
      />
      <Segmented
        fullWidth
        compact
        value={parts.kind}
        onChange={(next) => patch({ kind: (next || "linear") as GradientParts["kind"] })}
        options={GRADIENT_KIND_OPTIONS}
      />
      {parts.kind === "linear" ? (
        <div className="flex items-center gap-2">
          <Label>Angle</Label>
          <input
            type="number"
            data-builder-gradient-field="angle"
            style={numInputStyle}
            value={parts.angle}
            onChange={(e) => patch({ angle: Math.round(Number(e.target.value) || 0) })}
          />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {(["c1", "c2"] as const).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <ColorSwatchButton
              color={parts[k]}
              dataAttr={["data-builder-gradient-field", `${k}-pick`]}
              ariaLabel={`Pick gradient color ${k === "c1" ? "1" : "2"}`}
              onChange={(next) => patch({ [k]: next })}
            />
            <input
              type="text"
              data-builder-gradient-field={k}
              style={textInputStyle}
              value={parts[k]}
              onChange={(e) => patch({ [k]: e.target.value || GRADIENT_DEFAULTS[k] })}
            />
          </div>
        ))}
      </div>
      {parsed === null ? (
        <button
          type="button"
          data-builder-gradient-apply=""
          className="cursor-pointer rounded-md py-1 text-[11px] font-semibold"
          style={{ background: CHROME.surface2, color: CHROME.ink, border: `1px solid ${CHROME.controlBorder}` }}
          onClick={() => onChange(composeGradient(GRADIENT_DEFAULTS))}
        >
          Apply gradient
        </button>
      ) : null}
    </div>
  );
}

// ── Multi-stop gradient builder (Wave 3 · 3C) ────────────────────────────────

export interface GradientStop {
  color: string;
  position?: number; // 0–100 percent; undefined = even distribution
}

export interface GradientStopsParts {
  kind: "linear" | "radial";
  angle: number;
  stops: GradientStop[];
}

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
];

function stopCss(stop: GradientStop): string {
  return stop.position !== undefined
    ? `${stop.color} ${stop.position}%`
    : stop.color;
}

export function composeGradientStops(p: GradientStopsParts): string {
  const stopList = p.stops.map(stopCss).join(", ");
  return p.kind === "linear"
    ? `linear-gradient(${p.angle}deg, ${stopList})`
    : `radial-gradient(circle, ${stopList})`;
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
        onChange={(next) => patch({ kind: (next || "linear") as "linear" | "radial" })}
        options={GRADIENT_STOPS_KIND_OPTIONS}
      />
      {parts.kind === "linear" ? (
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
        className="cursor-pointer rounded-md py-1 text-[11px] font-semibold"
        style={{ background: CHROME.surface2, color: CHROME.ink, border: `1px solid ${CHROME.controlBorder}` }}
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
