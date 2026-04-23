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
 * If an explicit `thumbnailSrc` is passed on an option, the tile uses
 * that image and falls back to the schematic on load error. The default
 * experience is the inline SVG schematic — no external assets required.
 *
 * Accessibility: implemented with <label>/<input type="radio"> for
 * keyboard nav + SR support. Visual hit target is the surrounding tile.
 */

import { useState, type ReactNode } from "react";

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
  | "icon-row"
  | "metrics-row"
  | "logo-row"
  | "stack"
  | "numbered-column"
  | "numbered-cards"
  | "iconed"
  | "alternating"
  | "info-forward"
  | "press-italic"
  | "scroll-rail"
  | "grid-uniform"
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
  // Most-specific matches first so trust_strip's three row variants each
  // get their own distinctive schematic instead of all collapsing to "row".
  if (v.includes("metrics-row") || v === "metrics") return "metrics-row";
  if (v.includes("icon-row")) return "icon-row";
  if (v.includes("logo-row") || v === "logos") return "logo-row";
  if (v.includes("text-italic-serif") || v.includes("press-italic"))
    return "press-italic";
  if (v.includes("scroll-rail")) return "scroll-rail";
  if (v.includes("grid-uniform") || v.includes("uniform")) return "grid-uniform";
  if (v.includes("numbered-column")) return "numbered-column";
  if (v.includes("numbered-cards") || v.includes("numbered-card"))
    return "numbered-cards";
  if (v.includes("iconed")) return "iconed";
  if (v.includes("alternating") || v.includes("image-copy")) return "alternating";
  if (v.includes("info-forward")) return "info-forward";
  if (v.includes("horizontal-timeline") || v.includes("timeline"))
    return "timeline";
  if (v.includes("carousel")) return "carousel";
  if (v.includes("mosaic")) return "mosaic";
  if (v.includes("split")) return "split";
  if (v.includes("overlay") || v.includes("full-bleed") || v.includes("hero"))
    return "overlay";
  if (v.includes("band") || v.includes("minimal")) return "band";
  if (v.includes("row")) return "row";
  if (v.includes("column") || v.includes("stack") || v.includes("numbered"))
    return "stack";
  if (v.includes("grid") || v.includes("tile") || v.includes("mixed"))
    return "grid";
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
    case "icon-row":
      // Editorial trust-strip icon row — serif italic numerals under an icon.
      return (
        <svg {...common}>
          {[0, 1, 2].map((col) => (
            <g key={col} transform={`translate(${14 + col * 34}, 14)`}>
              <circle cx={14} cy={10} r={7} fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.7} />
              <text x={14} y={34} fontSize={8} fontStyle="italic" fontFamily="serif" textAnchor="middle" fill="currentColor" opacity={0.85}>{`0${col + 1}`}</text>
              <rect x={2} y={42} width={24} height={2.5} rx={1} fill="currentColor" opacity={0.55} />
              <rect x={4} y={48} width={20} height={2} rx={1} fill="currentColor" opacity={0.35} />
            </g>
          ))}
        </svg>
      );
    case "metrics-row":
      // Big stat numbers with caption underneath.
      return (
        <svg {...common}>
          {[0, 1, 2].map((col) => (
            <g key={col} transform={`translate(${14 + col * 34}, 18)`}>
              <text x={14} y={20} fontSize={16} fontWeight="600" textAnchor="middle" fill="currentColor" opacity={0.85}>{`${(col + 1) * 12}`}</text>
              <rect x={0} y={28} width={28} height={2.5} rx={1} fill="currentColor" opacity={0.55} />
              <rect x={4} y={34} width={20} height={2} rx={1} fill="currentColor" opacity={0.35} />
            </g>
          ))}
        </svg>
      );
    case "logo-row":
      // Flat logo silhouettes — longish rounded rects at uniform baseline.
      return (
        <svg {...common}>
          <line x1={6} y1={36} x2={114} y2={36} stroke="currentColor" strokeWidth={0.5} opacity={0.2} />
          {[
            { w: 22, opacity: 0.75 },
            { w: 28, opacity: 0.55 },
            { w: 18, opacity: 0.7 },
            { w: 26, opacity: 0.45 },
          ].map((item, i) => {
            const x = 8 + i * 28;
            return (
              <rect
                key={i}
                x={x}
                y={28}
                width={item.w}
                height={14}
                rx={2}
                fill="currentColor"
                opacity={item.opacity}
              />
            );
          })}
        </svg>
      );
    case "numbered-column":
      // Process-steps numbered-column — vertical stack with big numerals.
      return (
        <svg {...common}>
          {[0, 1, 2].map((row) => (
            <g key={row} transform={`translate(12, ${10 + row * 18})`}>
              <text x={0} y={14} fontSize={14} fontStyle="italic" fontFamily="serif" fill="currentColor" opacity={0.85}>{`0${row + 1}`}</text>
              <rect x={22} y={2} width={80} height={3} rx={1} fill="currentColor" opacity={0.7} />
              <rect x={22} y={8} width={60} height={2} rx={1} fill="currentColor" opacity={0.4} />
              <rect x={22} y={13} width={70} height={2} rx={1} fill="currentColor" opacity={0.35} />
            </g>
          ))}
        </svg>
      );
    case "numbered-cards":
      // Values-trio numbered-cards — 3 equal cards with big numerals.
      return (
        <svg {...common}>
          {[0, 1, 2].map((col) => (
            <g key={col} transform={`translate(${6 + col * 38}, 10)`}>
              <rect width={32} height={52} rx={3} fill="currentColor" opacity={0.12} />
              <text x={6} y={20} fontSize={14} fontStyle="italic" fontFamily="serif" fill="currentColor" opacity={0.85}>{`0${col + 1}`}</text>
              <rect x={6} y={30} width={22} height={2.5} rx={1} fill="currentColor" opacity={0.7} />
              <rect x={6} y={36} width={18} height={2} rx={1} fill="currentColor" opacity={0.4} />
              <rect x={6} y={41} width={20} height={2} rx={1} fill="currentColor" opacity={0.4} />
            </g>
          ))}
        </svg>
      );
    case "iconed":
      // 3 columns: icon above two short text lines.
      return (
        <svg {...common}>
          {[0, 1, 2].map((col) => (
            <g key={col} transform={`translate(${14 + col * 34}, 14)`}>
              <circle cx={14} cy={10} r={8} fill="none" stroke="currentColor" strokeWidth={1.4} opacity={0.7} />
              <circle cx={14} cy={10} r={3} fill="currentColor" opacity={0.7} />
              <rect x={2} y={26} width={24} height={3} rx={1} fill="currentColor" opacity={0.7} />
              <rect x={6} y={34} width={16} height={2} rx={1} fill="currentColor" opacity={0.4} />
              <rect x={4} y={40} width={20} height={2} rx={1} fill="currentColor" opacity={0.4} />
            </g>
          ))}
        </svg>
      );
    case "alternating":
      // Two rows: image-left+text-right, then text-left+image-right.
      return (
        <svg {...common}>
          <rect x={6} y={6} width={46} height={26} rx={2} fill="currentColor" opacity={0.55} />
          <rect x={58} y={12} width={50} height={3} rx={1} fill="currentColor" opacity={0.8} />
          <rect x={58} y={20} width={40} height={2} rx={1} fill="currentColor" opacity={0.45} />
          <rect x={58} y={40} width={50} height={26} rx={2} fill="currentColor" opacity={0.55} />
          <rect x={6} y={46} width={46} height={3} rx={1} fill="currentColor" opacity={0.8} />
          <rect x={6} y={54} width={36} height={2} rx={1} fill="currentColor" opacity={0.45} />
        </svg>
      );
    case "info-forward":
      // Thumbnail on right, copy-heavy block on left.
      return (
        <svg {...common}>
          <rect x={6} y={10} width={24} height={52} rx={2} fill="currentColor" opacity={0.5} />
          <rect x={34} y={14} width={78} height={3} rx={1} fill="currentColor" opacity={0.85} />
          <rect x={34} y={22} width={68} height={2} rx={1} fill="currentColor" opacity={0.5} />
          <rect x={34} y={28} width={72} height={2} rx={1} fill="currentColor" opacity={0.45} />
          <rect x={34} y={34} width={60} height={2} rx={1} fill="currentColor" opacity={0.45} />
          <rect x={34} y={44} width={30} height={8} rx={1.5} fill="currentColor" opacity={0.75} />
        </svg>
      );
    case "press-italic":
      // Editorial italic serif names in a quiet strip.
      return (
        <svg {...common}>
          <line x1={6} y1={36} x2={114} y2={36} stroke="currentColor" strokeWidth={0.5} opacity={0.2} />
          {["Vogue", "Harper's", "Brides", "Elle"].map((word, i) => (
            <text
              key={i}
              x={14 + i * 26}
              y={40}
              fontSize={8}
              fontStyle="italic"
              fontFamily="serif"
              fill="currentColor"
              opacity={0.75}
            >
              {word}
            </text>
          ))}
        </svg>
      );
    case "scroll-rail":
      // Long strip of thumbnails bleeding off the right edge.
      return (
        <svg {...common}>
          {[0, 1, 2, 3, 4].map((col) => (
            <rect
              key={col}
              x={6 + col * 26}
              y={12}
              width={22}
              height={48}
              rx={2}
              fill="currentColor"
              opacity={col < 4 ? 0.55 : 0.25}
            />
          ))}
          <path
            d="M114 36 l-5 -4 m5 4 l-5 4"
            stroke="currentColor"
            strokeWidth={1.4}
            fill="none"
            opacity={0.8}
          />
        </svg>
      );
    case "grid-uniform":
      // 3×2 uniform grid.
      return (
        <svg {...common}>
          {[0, 1].map((row) =>
            [0, 1, 2].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={8 + col * 36}
                y={10 + row * 28}
                width={30}
                height={22}
                rx={2}
                fill="currentColor"
                opacity={0.55}
              />
            )),
          )}
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

interface TileProps<V extends string> {
  name: string;
  option: VariantOption<V>;
  active: boolean;
  disabled?: boolean;
  onChange: (value: V) => void;
  sectionKey?: string;
}

function VariantTile<V extends string>({
  name,
  option,
  active,
  disabled,
  onChange,
  sectionKey,
}: TileProps<V>) {
  const schematicKey: SchematicKey | undefined =
    typeof option.schematic === "string"
      ? (option.schematic as SchematicKey)
      : undefined;
  const schematicNode =
    option.schematic && typeof option.schematic !== "string"
      ? option.schematic
      : null;
  const resolved: SchematicKey = schematicKey ?? inferSchematic(option.value);
  // Only render an <img> when an explicit thumbnailSrc is provided. The
  // convention-based path (`/section-thumbnails/<sectionKey>--<value>.png`)
  // was removed because no PNGs exist yet — it produced broken tiles.
  // `sectionKey` is still accepted on the props for forward-compat; when
  // real snapshots land, callers can pass `thumbnailSrc` per option.
  void sectionKey;
  const thumbnailSrc = option.thumbnailSrc;

  // If the thumbnail fails to load, fall back to the schematic.
  const [imgFailed, setImgFailed] = useState(false);
  const useImage = Boolean(thumbnailSrc) && !imgFailed;

  return (
    <label
      className={`group flex cursor-pointer flex-col gap-2 rounded-lg border p-2 transition ${
        active
          ? "border-foreground bg-foreground/5 ring-1 ring-foreground/30"
          : "border-border/60 bg-background hover:border-foreground/30"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        name={name}
        value={option.value}
        checked={active}
        disabled={disabled}
        onChange={() => onChange(option.value)}
        className="sr-only"
      />
      <span className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-md border border-border/40 bg-muted/20">
        {useImage && thumbnailSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailSrc}
            alt=""
            aria-hidden
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : schematicNode ? (
          <span className="h-full w-full">{schematicNode}</span>
        ) : (
          <Schematic kind={resolved} />
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{option.label}</span>
        {option.hint ? (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {option.hint}
          </span>
        ) : null}
      </span>
    </label>
  );
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
        {options.map((opt) => (
          <VariantTile
            key={opt.value}
            name={name}
            option={opt}
            active={opt.value === value}
            disabled={disabled}
            onChange={onChange}
            sectionKey={sectionKey}
          />
        ))}
      </div>
    </fieldset>
  );
}
