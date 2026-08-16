/**
 * thumbnails.tsx — mini-mockups for the footer inspector's chip groups.
 *
 * A variant chip labelled "Editorial" tells the operator nothing; a 44×28
 * wireframe of the actual layout tells them everything in one glance. Same
 * rationale as `site-header/thumbnails.tsx`.
 *
 * Rendering rules these follow:
 *   - `currentColor` only, so the chip's selected/idle state tints the mockup
 *     for free and there is no second colour system to keep in sync.
 *   - No brand colour, no gold/rust/amber — the mockup describes STRUCTURE.
 *   - No text: at this size a glyph reads as noise, and a real word would need
 *     translating.
 */

const VW = 44;
const VH = 28;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width={VW}
      height={VH}
      viewBox={`0 0 ${VW} ${VH}`}
      fill="none"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A filled bar — stands in for a block of text. */
function Bar(props: { x: number; y: number; w: number; h?: number; o?: number }) {
  return (
    <rect
      x={props.x}
      y={props.y}
      width={props.w}
      height={props.h ?? 2}
      rx={1}
      fill="currentColor"
      opacity={props.o ?? 0.55}
    />
  );
}

/** Standard — a brand block over evenly weighted link columns. */
export function FooterStandardThumb() {
  return (
    <Frame>
      <Bar x={5} y={5} w={12} h={3} o={0.85} />
      <Bar x={22} y={5} w={7} />
      <Bar x={22} y={9} w={5} o={0.35} />
      <Bar x={22} y={12} w={6} o={0.35} />
      <Bar x={33} y={5} w={7} />
      <Bar x={33} y={9} w={5} o={0.35} />
      <Bar x={33} y={12} w={6} o={0.35} />
      <Bar x={5} y={22} w={34} h={1.5} o={0.25} />
    </Frame>
  );
}

/** Compact — one line: wordmark left, links right. */
export function FooterCompactThumb() {
  return (
    <Frame>
      <Bar x={5} y={13} w={10} h={3} o={0.85} />
      <Bar x={22} y={14} w={5} o={0.45} />
      <Bar x={29} y={14} w={5} o={0.45} />
      <Bar x={36} y={14} w={3} o={0.45} />
    </Frame>
  );
}

/** Rich — wide brand block plus three columns and a social row. */
export function FooterRichThumb() {
  return (
    <Frame>
      <Bar x={5} y={5} w={11} h={3} o={0.85} />
      <Bar x={5} y={10} w={9} o={0.3} />
      <Bar x={5} y={13} w={7} o={0.3} />
      <Bar x={20} y={5} w={5} />
      <Bar x={20} y={9} w={4} o={0.35} />
      <Bar x={27} y={5} w={5} />
      <Bar x={27} y={9} w={4} o={0.35} />
      <Bar x={34} y={5} w={5} />
      <Bar x={34} y={9} w={4} o={0.35} />
      <circle cx={7} cy={22} r={1.6} fill="currentColor" opacity={0.5} />
      <circle cx={12} cy={22} r={1.6} fill="currentColor" opacity={0.5} />
      <circle cx={17} cy={22} r={1.6} fill="currentColor" opacity={0.5} />
    </Frame>
  );
}

/** Editorial — oversized wordmark, columns tucked to the right. */
export function FooterEditorialThumb() {
  return (
    <Frame>
      <Bar x={5} y={6} w={18} h={6} o={0.9} />
      <Bar x={28} y={6} w={5} o={0.4} />
      <Bar x={28} y={9} w={4} o={0.3} />
      <Bar x={35} y={6} w={5} o={0.4} />
      <Bar x={35} y={9} w={4} o={0.3} />
      <Bar x={5} y={21} w={34} h={1.5} o={0.22} />
    </Frame>
  );
}

// ── tone ─────────────────────────────────────────────────────────────────────

/** Follow — inherits the page tone; drawn as a split swatch. */
export function ToneFollowThumb() {
  return (
    <Frame>
      <rect x={5} y={6} width={17} height={16} rx={2} fill="currentColor" opacity={0.12} />
      <rect x={22} y={6} width={17} height={16} rx={2} fill="currentColor" opacity={0.62} />
    </Frame>
  );
}

/** Light — pale surface with dark text. */
export function ToneLightThumb() {
  return (
    <Frame>
      <rect
        x={5}
        y={6}
        width={34}
        height={16}
        rx={2}
        fill="currentColor"
        opacity={0.1}
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeWidth={0.75}
      />
      <Bar x={9} y={11} w={14} o={0.7} />
      <Bar x={9} y={15} w={9} o={0.45} />
    </Frame>
  );
}

/** Deep — dark canvas with light text. */
export function ToneDeepThumb() {
  return (
    <Frame>
      <rect x={5} y={6} width={34} height={16} rx={2} fill="currentColor" opacity={0.72} />
      <rect x={9} y={11} width={14} height={2} rx={1} fill="#ffffff" opacity={0.9} />
      <rect x={9} y={15} width={9} height={2} rx={1} fill="#ffffff" opacity={0.55} />
    </Frame>
  );
}

// ── brand display ────────────────────────────────────────────────────────────

/** Image only — the logo asset carries the wordmark. */
export function BrandImageThumb() {
  return (
    <Frame>
      <rect
        x={13}
        y={9}
        width={18}
        height={10}
        rx={2}
        stroke="currentColor"
        strokeOpacity={0.6}
        strokeWidth={1}
      />
      <circle cx={18} cy={13} r={1.4} fill="currentColor" opacity={0.6} />
      <path
        d="M15 18l4-4 3 3 2-2 4 4"
        stroke="currentColor"
        strokeOpacity={0.6}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Text only — wordmark plus tagline. */
export function BrandTextThumb() {
  return (
    <Frame>
      <Bar x={12} y={10} w={20} h={4} o={0.85} />
      <Bar x={15} y={17} w={14} o={0.35} />
    </Frame>
  );
}

/** Image and text — logo above the wordmark. */
export function BrandImageAndTextThumb() {
  return (
    <Frame>
      <rect
        x={16}
        y={5}
        width={12}
        height={8}
        rx={2}
        stroke="currentColor"
        strokeOpacity={0.6}
        strokeWidth={1}
      />
      <Bar x={13} y={16} w={18} h={3} o={0.8} />
      <Bar x={16} y={21} w={12} o={0.3} />
    </Frame>
  );
}
