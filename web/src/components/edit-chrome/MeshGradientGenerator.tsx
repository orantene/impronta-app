"use client";

/**
 * Phase 5 — mesh-gradient generator.
 *
 * Lets the operator build a free mesh gradient (3-5 stops with editable
 * positions + colors) and generate the matching CSS that can be
 * pasted into the per-section custom CSS field, OR applied as the
 * page background via a new `--token-color-background-mesh` CSS var.
 *
 * Pure CSS output — no canvas, no SVG. Each stop becomes a
 * radial-gradient layer; layers stack as a `background-image` value.
 */

import { useMemo, useState, type ReactElement } from "react";

interface Stop {
  x: number; // 0-100
  y: number; // 0-100
  color: string; // #rrggbb
  size: number; // 0-100 (transparent at this %)
}

const DEFAULT_STOPS: Stop[] = [
  { x: 20, y: 20, color: "#f5c8c8", size: 45 },
  { x: 80, y: 30, color: "#ffdcc3", size: 50 },
  { x: 70, y: 80, color: "#dcc3dc", size: 50 },
  { x: 20, y: 80, color: "#fae6d7", size: 45 },
];

function buildCss(stops: ReadonlyArray<Stop>, baseColor: string): string {
  const layers = stops
    .map(
      (s) =>
        `radial-gradient(at ${s.x}% ${s.y}%, ${s.color} 0, transparent ${s.size}%)`,
    )
    .join(",\n    ");
  return `background-color: ${baseColor};\nbackground-image:\n    ${layers};\nbackground-attachment: fixed;`;
}

interface Props {
  /** Optional callback — if set, an "Apply to background" button shows
   *  that pushes the generated CSS to the parent. */
  onApply?: (css: string) => void;
}

export function MeshGradientGenerator({ onApply }: Props): ReactElement {
  const [stops, setStops] = useState<ReadonlyArray<Stop>>(DEFAULT_STOPS);
  const [baseColor, setBaseColor] = useState<string>("#faf3ee");

  const css = useMemo(() => buildCss(stops, baseColor), [stops, baseColor]);

  function patch(i: number, p: Partial<Stop>) {
    setStops((prev) => prev.map((s, j) => (j === i ? { ...s, ...p } : s)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
        Mesh gradient generator
      </div>
      <div
        className="relative h-32 rounded-md ring-1 ring-border/40"
        style={{
          backgroundColor: baseColor,
          backgroundImage: stops
            .map((s) => `radial-gradient(at ${s.x}% ${s.y}%, ${s.color} 0, transparent ${s.size}%)`)
            .join(", "),
        }}
        aria-label="Mesh gradient preview"
      />
      <div className="flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-wide text-stone-400">Base</label>
        <input
          type="color"
          value={baseColor}
          onChange={(e) => setBaseColor(e.target.value)}
          className="h-6 w-8 rounded-lg border border-[#e5e0d5]"
        />
        <span className="font-mono text-[11px] text-stone-400">{baseColor}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => stops.length < 5 && setStops([...stops, { x: 50, y: 50, color: "#cccccc", size: 45 }])}
            disabled={stops.length >= 5}
            className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2 py-0.5 text-[10px] text-stone-600 hover:bg-white hover:border-stone-300 disabled:opacity-50 transition-colors"
          >
            + Stop
          </button>
          <button
            type="button"
            onClick={() => stops.length > 2 && setStops(stops.slice(0, -1))}
            disabled={stops.length <= 2}
            className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2 py-0.5 text-[10px] text-stone-600 hover:bg-white hover:border-stone-300 disabled:opacity-50 transition-colors"
          >
            − Stop
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {stops.map((s, i) => (
          <div key={i} className="grid grid-cols-[20px_60px_60px_1fr_24px] items-center gap-2 text-[11px]">
            <span className="text-stone-400">#{i + 1}</span>
            <label className="flex items-center gap-1">
              x
              <input type="number" min={0} max={100} value={s.x} onChange={(e) => patch(i, { x: Number(e.target.value) })} className="w-12 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-1.5 py-0.5 text-[11px] text-stone-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors" />
            </label>
            <label className="flex items-center gap-1">
              y
              <input type="number" min={0} max={100} value={s.y} onChange={(e) => patch(i, { y: Number(e.target.value) })} className="w-12 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-1.5 py-0.5 text-[11px] text-stone-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors" />
            </label>
            <div className="flex items-center gap-1">
              <input type="color" value={s.color} onChange={(e) => patch(i, { color: e.target.value })} className="h-5 w-7 rounded-lg border border-[#e5e0d5]" />
              <span className="font-mono text-[10px] text-stone-400">{s.color}</span>
            </div>
            <input type="number" min={10} max={100} value={s.size} onChange={(e) => patch(i, { size: Number(e.target.value) })} className="w-12 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-1.5 py-0.5 text-[11px] text-stone-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors" title="size %" />
          </div>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-stone-400">
          CSS output
        </summary>
        <pre className="mt-1 overflow-x-auto rounded-lg bg-[#faf9f6]/60 border border-[#e5e0d5] p-2 text-[10px]">
          {css}
        </pre>
      </details>
      {onApply ? (
        <button
          type="button"
          onClick={() => onApply(css)}
          className="self-end rounded-md border border-[#3d4f7c] bg-[#3d4f7c] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#4a5e94]"
        >
          Apply
        </button>
      ) : null}
    </div>
  );
}
