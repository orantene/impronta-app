/**
 * BuilderIconSvg — the ONE way a registry glyph becomes markup.
 *
 * Before this, the same paths were drawn by five different pieces of code: the
 * icon node's renderer, `SocialGlyph`, `ClusterIcon`, the header-widget
 * placeholder, and a duplicate 18px tile renderer in the inspector. Four of
 * them carried copies of the same `d` strings, so a fix to one silently left
 * the others wrong.
 *
 * Contract: inline SVG, `currentColor`, sized in `em` so the glyph scales with
 * whatever font-size its box already has. That is not a style preference — it
 * is what the CSP allows (no icon font, no CDN sprite) and what lets a glyph
 * inherit a themed colour without every call site wiring one.
 */

import { getBuilderIconDefinition } from "./icon-registry";
import type { BuilderIconDefinition, BuilderIconName } from "./icon-registry";

export interface BuilderIconSvgProps {
  /** Registry name. Unknown names fall back to the first glyph, never crash. */
  name?: BuilderIconName;
  /** Pre-resolved definition, when the caller already looked it up. */
  definition?: BuilderIconDefinition;
  className?: string;
  /** Stroke weight for outline glyphs. Ignored by solid brand marks. */
  strokeWidth?: number;
  /**
   * Accessible name. Omit for decoration (the default) — a glyph beside its own
   * text label must NOT be announced, or a screen reader reads it twice.
   */
  title?: string;
}

export function BuilderIconSvg({
  name,
  definition,
  className,
  strokeWidth = 1.8,
  title,
}: BuilderIconSvgProps) {
  const icon = definition ?? getBuilderIconDefinition(name);
  const solid = icon.render === "fill";

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={solid ? "currentColor" : "none"}
      stroke={solid ? undefined : "currentColor"}
      strokeWidth={solid ? undefined : strokeWidth}
      strokeLinecap={solid ? undefined : "round"}
      strokeLinejoin={solid ? undefined : "round"}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {icon.rects?.map((rect, i) => (
        <rect
          key={`r${i}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={rect.rx}
        />
      ))}
      {icon.paths.map((d, i) => (
        <path key={`p${i}`} d={d} />
      ))}
      {icon.circles?.map((circle, i) => (
        <circle
          key={`c${i}`}
          cx={circle.cx}
          cy={circle.cy}
          r={circle.r}
          // A filled dot inside an outline glyph (Instagram's lens highlight)
          // needs its own paint, or it renders as an empty ring.
          fill={circle.fill ? "currentColor" : undefined}
          stroke={circle.fill ? "none" : undefined}
        />
      ))}
      {icon.polygons?.map((points, i) => (
        <polygon key={`g${i}`} points={points} />
      ))}
    </svg>
  );
}
