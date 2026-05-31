"use client";

import { Segmented, type SegmentedOption } from "../kit/segmented";
import { CHROME } from "../kit/tokens";

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

function isHex(color: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(color.trim());
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
            <input
              type="color"
              data-builder-gradient-field={`${k}-pick`}
              className="h-7 w-7 shrink-0 cursor-pointer rounded"
              style={{ border: `1px solid ${CHROME.controlBorder}`, background: "transparent" }}
              value={isHex(parts[k]) ? parts[k] : "#000000"}
              onChange={(e) => patch({ [k]: e.target.value })}
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
