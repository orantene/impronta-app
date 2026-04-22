"use client";

/**
 * Shared variant picker — radio cards with schematic thumbnails.
 *
 * Drops into any section Editor in place of a bare <select> for the
 * `variant` field. Renders each option as a tile with:
 *   - a small SVG schematic (layout cue — not a screenshot)
 *   - the variant's label + one-line hint
 *   - active-state ring
 *
 * If a real PNG screenshot exists at
 * `/section-thumbnails/<section-key>--<variant-key>.png`, the tile uses
 * that instead. This lets designers drop in real snapshots later without
 * touching code.
 *
 * Accessibility: implemented with <label>/<input type="radio"> for
 * keyboard nav + SR support. Visual hit target is the surrounding tile.
 */

import type { ReactNode } from "react";

export interface VariantOption<V extends string = string> {
  value: V;
  label: string;
  /** Short hint line shown under the label. */
  hint?: string;
  /**
   * One of the stock schematic keys below, or a React node for a custom
   * schematic. If omitted we infer from `value` (keywords like "carousel",
   * "grid", "mosaic").
   */
  schematic?: SchematicKey | ReactNode;
  /** Optional path to a real PNG screenshot, takes precedence over schematic. */
  thumbnailSrc?: string;
}

export type SchematicKey =
  | "grid"
  | "carousel"
  | "row"
  | "stack"
  | "mosaic"
  | "timeline"
  | "split"
  | "overlay"
  | "band"
  | "hero";

export interface VariantPickerProps<V extends string = string> {
  /** Stable input name, scoped per editor (e.g. "trust_strip.variant"). */
  name: string;
  options: ReadonlyArray<VariantOption<V>>;
  value: V;
  onChange: (value: V) => void;
  /** Optional label rendered above the tiles. */
  legend?: string;
  disabled?: boolean;
  /** Section key (e.g. "trust_strip") — used to resolve thumbnail path. */
  sectionKey?: string;
}

function inferSchematic(value: string): SchematicKey {
  const v = value.toLowerCase();
  if (v.includes("carousel") || v.includes("scroll-rail")) return "carousel";
  if (v.includes("mosaic")) return "mosaic";
  if (v.includes("timeline")) return "timeline";
  if (v.includes("split")) return "split";
  if (v.includes("overlay") || v.includes("full-bleed") || v.includes("hero"))
    return "overlay";
  if (v.includes("band") || v.includes("minimal")) return "band";
  if (v.includes("row") || v.includes("icon-row") || v.includes("logo-row"))
    return "row";
  if (v.includes("column") || v.includes("stack") || v.includes("numbered"))
    return "stack";
  if (v.includes("grid") || v.includes("tile")) return "grid";
  return "grid";
}

function Schematic({ kind }: { kind: SchematicKey }) {
  // All schematics share a 120×72 viewBox so the picker tiles line up.
  const common = {
    viewBox: "0 0 120 72",
    className: "h-full w-full text-foreground/70",
  };
  switch (kind) {
    case "grid":
      return (
        <svg {...common}>
          {[0, 1, 2].map((col) => (
            <rect
              key={col}
              x={10 + col * 34}
              y={14}
              width={28}
              height={44}
              rx={2}
              fill="currentColor"
              opacity={0.55}
            />
          ))}
        </svg>
      );
    case "carousel":
      return (
        <svg {...common}>
          {[0, 1, 2, 3].map((col) => (
            <rect
              key={col}
              x={6 + col * 30}
              y={14}
              width={24}
              height={44}
              rx={2}
              fill="currentColor"
              opacity={col < 3 ? 0.55 : 0.25}
            />
          ))}
          <path
            d="M110 36 l-6 -5 m6 5 l-6 5"
            stroke="currentColor"
            strokeWidth={1.5}
            fill="none"
            opacity={0.8}
          />
        </svg>
      );
    case "row":
      return (
        <svg {...common}>
          {[0, 1, 2].map((col) => (
            <g key={col} transform={`translate(${14 + col * 34}, 26)`}>
              <circle cx={10} cy={8} r={6} fill="currentColor" opacity={0.65} />
              <rect y={20} width={28} height={3} rx={1} fill="currentColor" opacity={0.5} />
            </g>
          ))}
        </svg>
      );
    case "stack":
      return (
        <svg {...common}>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(12, ${10 + i * 18})`}>
              <rect width={8} height={12} rx={1} fill="currentColor" opacity={0.8} />
              <rect x={14} y={2} width={80} height={3} rx={1} fill="currentColor" opacity={0.65} />
              <rect x={14} y={8} width={58} height={2} rx={1} fill="currentColor" opacity={0.35} />
            </g>
          ))}
        </svg>
      );
    case "mosaic":
      return (
        <svg {...common}>
          <rect x={6} y={10} width={42} height={52} rx={2} fill="currentColor" opacity={0.55} />
          <rect x={52} y={10} width={26} height={24} rx={2} fill="currentColor" opacity={0.4} />
          <rect x={52} y={38} width={26} height={24} rx={2} fill="currentColor" opacity={0.6} />
          <rect x={82} y={10} width={32} height={52} rx={2} fill="currentColor" opacity={0.5} />
        </svg>
      );
    case "timeline":
      return (
        <svg {...common}>
          <line x1={10} y1={36} x2={110} y2={36} stroke="currentColor" strokeWidth={1} opacity={0.3} />
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${18 + i * 28}, 36)`}>
              <circle r={5} fill="currentColor" opacity={0.75} />
              <rect x={-12} y={12} width={24} height={3} rx={1} fill="currentColor" opacity={0.5} />
            </g>
          ))}
        </svg>
      );
    case "split":
      return (
        <svg {...common}>
          <rect x={6} y={8} width={50} height={56} rx={2} fill="currentColor" opacity={0.55} />
          <rect x={62} y={18} width={50} height={4} rx={1} fill="currentColor" opacity={0.85} />
          <rect x={62} y={28} width={44} height={3} rx={1} fill="currentColor" opacity={0.5} />
          <rect x={62} y={46} width={24} height={8} rx={2} fill="currentColor" opacity={0.75} />
        </svg>
      );
    case "overlay":
      return (
        <svg {...common}>
          <rect x={4} y={6} width={112} height={60} rx={3} fill="currentColor" opacity={0.18} />
          <rect x={4} y={36} width={112} height={30} rx={0} fill="currentColor" opacity={0.35} />
          <rect x={16} y={42} width={60} height={4} rx={1} fill="currentColor" opacity={0.9} />
          <rect x={16} y={50} width={44} height={3} rx={1} fill="currentColor" opacity={0.55} />
        </svg>
      );
    case "band":
      return (
        <svg {...common}>
          <rect x={4} y={18} width={112} height={36} rx={3} fill="currentColor" opacity={0.18} />
          <rect x={24} y={30} width={52} height={4} rx={1} fill="currentColor" opacity={0.85} />
          <rect x={24} y={38} width={34} height={3} rx={1} fill="currentColor" opacity={0.5} />
          <rect x={84} y={28} width={22} height={10} rx={2} fill="currentColor" opacity={0.75} />
        </svg>
      );
    case "hero":
      return (
        <svg {...common}>
          <rect x={0} y={0} width={120} height={72} fill="currentColor" opacity={0.1} />
          <rect x={0} y={0} width={120} height={72} fill="url(#hero-grad)" opacity={0.3} />
          <defs>
            <linearGradient id="hero-grad" x1={0} y1={0} x2={0} y2={1}>
              <stop offset={0} stopColor="currentColor" stopOpacity={0} />
              <stop offset={1} stopColor="currentColor" stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <rect x={14} y={40} width={58} height={4} rx={1} fill="currentColor" opacity={0.9} />
          <rect x={14} y={48} width={80} height={3} rx={1} fill="currentColor" opacity={0.55} />
          <rect x={14} y={56} width={20} height={6} rx={1} fill="currentColor" opacity={0.85} />
        </svg>
      );
  }
}

export function VariantPicker<V extends string>({
  name,
  options,
  value,
  onChange,
  legend,
  disabled,
  sectionKey,
}: VariantPickerProps<V>) {
  return (
    <fieldset className="flex flex-col gap-2">
      {legend ? (
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {legend}
        </legend>
      ) : null}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {options.map((opt) => {
          const active = opt.value === value;
          const schematicKey: SchematicKey | undefined =
            typeof opt.schematic === "string"
              ? (opt.schematic as SchematicKey)
              : undefined;
          const schematicNode =
            opt.schematic && typeof opt.schematic !== "string"
              ? opt.schematic
              : null;
          const resolved: SchematicKey =
            schematicKey ?? inferSchematic(opt.value);
          const thumbnailSrc =
            opt.thumbnailSrc ??
            (sectionKey
              ? `/section-thumbnails/${sectionKey}--${opt.value}.png`
              : undefined);
          return (
            <label
              key={opt.value}
              className={`group flex cursor-pointer flex-col gap-2 rounded-lg border p-2 transition ${
                active
                  ? "border-foreground bg-foreground/5 ring-1 ring-foreground/30"
                  : "border-border/60 bg-background hover:border-foreground/30"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={active}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-md border border-border/40 bg-muted/20">
                {thumbnailSrc ? (
                  <span
                    className="h-full w-full bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${thumbnailSrc})`,
                    }}
                    aria-hidden
                  />
                ) : schematicNode ? (
                  <span className="h-full w-full">{schematicNode}</span>
                ) : (
                  <Schematic kind={resolved} />
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{opt.label}</span>
                {opt.hint ? (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {opt.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
