/**
 * Tulala brand lockup — the canonical logo system.
 *
 * Three pieces, composable per surface:
 *
 * - `TulalaWordmark` — a custom-drawn monoline "tulala." (SVG paths, not a
 *   font). Rounded geometric strokes inherit `currentColor` so the mark sits
 *   on light or inverse surfaces; only the full-stop carries the brand
 *   accent. This is THE wordmark — never re-set "tulala" in Geist/Fraunces.
 * - `TulalaMark` — the compact app tile: forest squircle with three rising
 *   notes ("tu·la·la"), the lead note in brand orange. Favicon, footer,
 *   avatars, anywhere the full wordmark doesn't fit.
 * - `TulalaLogo` — mark + wordmark lockup for headers.
 *
 * Colors are literal brand constants on purpose: the logo must not re-theme
 * with surface tokens (only the letter strokes adapt via currentColor).
 */

const BRAND_ORANGE = "#ff8332";
const BRAND_FOREST = "#1e3a2d";
const BRAND_FOREST_BRIGHT = "#2e6b52";
const BRAND_FOREST_DEEP = "#132419";
const BRAND_BONE = "#f4efe6";

/** Aspect ratio of the wordmark viewBox (width / height). */
const WORDMARK_RATIO = 116 / 36;

export function TulalaWordmark({
  height = 24,
  dotColor = BRAND_ORANGE,
  className,
}: {
  /** Rendered height in px; width follows the viewBox ratio. */
  height?: number;
  /** Full-stop accent. Defaults to brand orange; pass forest on tenant surfaces. */
  dotColor?: string;
  className?: string;
}) {
  return (
    <svg
      width={Math.round(height * WORDMARK_RATIO)}
      height={height}
      viewBox="0 0 116 36"
      fill="none"
      aria-hidden
      className={className}
    >
      <g
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* t */}
        <path d="M8 7.5 V25 Q8 30 13 30" />
        <path d="M3.5 14 H13.5" />
        {/* u */}
        <path d="M21 14 V22 A8 8 0 0 0 37 22 V14" />
        {/* l */}
        <path d="M45 6 V30" />
        {/* a */}
        <circle cx="61" cy="22.1" r="8.25" />
        <path d="M69 14 V30" />
        {/* l */}
        <path d="M77 6 V30" />
        {/* a */}
        <circle cx="93" cy="22.1" r="8.25" />
        <path d="M101 14 V30" />
      </g>
      <circle cx="110.5" cy="28.6" r="3.6" fill={dotColor} />
    </svg>
  );
}

export function TulalaMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id="tl-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BRAND_FOREST_BRIGHT} />
          <stop offset="1" stopColor={BRAND_FOREST_DEEP} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#tl-mark-grad)" />
      <circle cx="9.5" cy="21.5" r="2.3" fill={BRAND_BONE} opacity="0.75" />
      <circle cx="15.8" cy="17.2" r="2.9" fill={BRAND_BONE} />
      <circle cx="22.8" cy="11.8" r="3.6" fill={BRAND_ORANGE} />
    </svg>
  );
}

export function TulalaLogo({
  markSize = 28,
  wordmarkHeight = 26,
  withMark = true,
  className,
}: {
  markSize?: number;
  wordmarkHeight?: number;
  withMark?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center gap-2.5 leading-none ${className ?? ""}`}
    >
      {withMark ? <TulalaMark size={markSize} /> : null}
      <TulalaWordmark height={wordmarkHeight} />
    </span>
  );
}

export const TULALA_BRAND_COLORS = {
  orange: BRAND_ORANGE,
  forest: BRAND_FOREST,
  forestBright: BRAND_FOREST_BRIGHT,
  forestDeep: BRAND_FOREST_DEEP,
  bone: BRAND_BONE,
} as const;
