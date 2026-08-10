/**
 * Tulala brand lockup — the canonical logo system.
 *
 * Three pieces, composable per surface:
 *
 * - `TulalaWordmark` — a custom-drawn monoline "tulala" (SVG paths, not a
 *   font) whose full-stop rises into a three-dot trail: a solid dot on the
 *   baseline, then two smaller dots drifting up and to the right, fading as
 *   they go ("tu·la·la" trailing off). Letter strokes inherit `currentColor`;
 *   only the trail carries the accent. This is THE wordmark — never re-set
 *   "tulala" in Geist/Fraunces.
 * - `TulalaMark` — the compact mark: the same rising trail, standalone on a
 *   transparent background. Favicon, avatars, anywhere the full wordmark
 *   doesn't fit. It is a crop of the wordmark's own trail, so mark and
 *   wordmark read as one system.
 * - `TulalaLogo` — thin wrapper for header/footer call sites.
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
const WORDMARK_RATIO = 120 / 36;

export function TulalaWordmark({
  height = 24,
  dotColor = BRAND_ORANGE,
  className,
}: {
  /** Rendered height in px; width follows the viewBox ratio. */
  height?: number;
  /** Trail accent. Defaults to brand orange; pass forest on tenant surfaces. */
  dotColor?: string;
  className?: string;
}) {
  return (
    <svg
      width={Math.round(height * WORDMARK_RATIO)}
      height={height}
      viewBox="0 0 120 36"
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
      {/* the rising trail — full-stop drifting up-right, fading */}
      <circle cx="110.5" cy="28.6" r="3.6" fill={dotColor} />
      <circle cx="113.6" cy="20.6" r="2.5" fill={dotColor} opacity="0.7" />
      <circle cx="116.2" cy="14.4" r="1.7" fill={dotColor} opacity="0.45" />
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
      <circle cx="11" cy="23.8" r="6.2" fill={BRAND_ORANGE} />
      <circle cx="17.8" cy="14.8" r="4.4" fill={BRAND_ORANGE} opacity="0.7" />
      <circle cx="23.4" cy="7.6" r="3" fill={BRAND_ORANGE} opacity="0.45" />
    </svg>
  );
}

export function TulalaLogo({
  wordmarkHeight = 26,
  className,
}: {
  wordmarkHeight?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center leading-none ${className ?? ""}`}
    >
      <TulalaWordmark height={wordmarkHeight} />
    </span>
  );
}

const BRAND_DESCRIPTOR_EN = "The Commerce Platform for Talent";
const BRAND_DESCRIPTOR_ES = "La Plataforma de Comercio para el Talento";

/**
 * The full brand lockup — wordmark + "The Commerce Platform for Talent"
 * tagline, stacked. This is THE default logo: every surface (marketing,
 * directory, auth, workspace/talent/client app shell, platform HQ) shows
 * this unless the current tenant/user is on a plan tier that unlocks a
 * custom logo AND has actually uploaded one — that override replaces this
 * lockup wholesale, it never merges with it.
 */
export function TulalaBrandLockup({
  wordmarkHeight = 25,
  isSpanish = false,
  color,
  descriptorOpacity = 0.55,
  className,
}: {
  wordmarkHeight?: number;
  isSpanish?: boolean;
  /** Text color for both the wordmark strokes and the tagline. */
  color?: string;
  descriptorOpacity?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex flex-col items-start leading-none ${className ?? ""}`}
      style={color ? { color } : undefined}
    >
      <TulalaWordmark height={wordmarkHeight} />
      <span
        className="mt-1 whitespace-nowrap text-[0.5625rem] font-medium uppercase tracking-[0.2em]"
        style={{ opacity: descriptorOpacity }}
      >
        {isSpanish ? BRAND_DESCRIPTOR_ES : BRAND_DESCRIPTOR_EN}
      </span>
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
