"use client";

/**
 * Brand logo tiles for the integrations hub.
 *
 * Each integration renders as a rounded "app tile": a brand-coloured square
 * with a simple white glyph, so the catalog reads like an integration gallery
 * (Linear/Vercel/Notion style) instead of a text list. Keyed by integration
 * key so EVERY current and future catalog entry gets a tile automatically —
 * add a new entry here and the card picks it up.
 *
 * Inline SVG only: no extra dependency, no external requests, CSP-safe.
 * Glyphs are simplified brand-evocative marks (not pixel-exact logos), in the
 * recognised brand colour — enough to scan by, nothing to license.
 */

import type { CSSProperties, ReactElement } from "react";

type Brand = { bg: string; fg: string; glyph: ReactElement };

// Simple white glyphs (24×24 viewBox) on a brand-coloured tile.
const PIN = (
  <path
    d="M12 2.2c-3.5 0-6.3 2.8-6.3 6.3 0 4.4 6.3 12 6.3 12s6.3-7.6 6.3-12c0-3.5-2.8-6.3-6.3-6.3Zm0 8.7a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8Z"
    fill="currentColor"
  />
);
const BARS = (
  <g fill="currentColor">
    <rect x="4" y="13" width="3.6" height="7" rx="1.2" />
    <rect x="10.2" y="9" width="3.6" height="11" rx="1.2" />
    <rect x="16.4" y="5" width="3.6" height="15" rx="1.2" />
  </g>
);
const INFINITY = (
  <path
    d="M7 8.2c-2.3 0-3.8 1.9-3.8 3.8S4.7 15.8 7 15.8c2.6 0 4-3.8 5-3.8s2.4 3.8 5 3.8c2.3 0 3.8-1.9 3.8-3.8S23.3 8.2 21 8.2c-2.6 0-4 3.8-5 3.8s-2.4-3.8-5-3.8Z"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
  />
);
const NOTE = (
  <path
    d="M9 4v9.4a3 3 0 1 1-2-2.83V7.2c1.9.7 3.4 2.3 3.9 4.3.2-2.9-1.4-5.6-3.9-7.5Zm5.4 0c.5 2.3 2.3 4 4.6 4.3v2.3c-1.7-.1-3.3-.7-4.6-1.7v5.7a4.7 4.7 0 1 1-3-4.4V4h3Z"
    fill="currentColor"
  />
);
const IN = (
  <g fill="currentColor">
    <rect x="4" y="9" width="3.1" height="11" rx="0.4" />
    <circle cx="5.55" cy="5.4" r="1.9" />
    <path d="M10 9h3v1.6c.6-1 1.7-1.8 3.4-1.8 2.6 0 3.9 1.7 3.9 4.7V20h-3.1v-5.1c0-1.4-.5-2.3-1.8-2.3-1 0-1.6.7-1.9 1.4-.1.25-.1.6-.1.95V20H10V9Z" />
  </g>
);
const TAG = (
  <path
    d="M11.3 3.2 3.5 11a2.4 2.4 0 0 0 0 3.4l6.1 6.1a2.4 2.4 0 0 0 3.4 0l7.8-7.8a2.4 2.4 0 0 0 0-3.4l-6.1-6.1a2.4 2.4 0 0 0-3.4 0Zm.9 7.2a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z"
    fill="currentColor"
  />
);
const SHIELD = (
  <path
    d="M12 2.6 5 5.4v5.1c0 4.2 3 8.1 7 9.2 4-1.1 7-5 7-9.2V5.4L12 2.6Zm-1 11.7-2.7-2.7 1.4-1.4 1.3 1.3 3.5-3.5L16 9.4l-5 4.9Z"
    fill="currentColor"
  />
);
const STRIPE_S = (
  <path
    d="M13.4 9.6c0-.8.66-1.1 1.7-1.1 1.5 0 3.4.46 4.9 1.27V5.4A12.4 12.4 0 0 0 15.1 4.6c-3.5 0-5.9 1.84-5.9 4.92 0 4.8 6.5 4 6.5 6.1 0 .95-.82 1.25-1.95 1.25-1.65 0-3.8-.68-5.45-1.6v4.45c1.85.8 3.7 1.13 5.45 1.13 3.6 0 6.05-1.78 6.05-4.9 0-5.18-6.55-4.25-6.55-6.3Z"
    fill="currentColor"
  />
);
const ENVELOPE = (
  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.2" />
    <path d="m4 7 8 6 8-6" strokeLinecap="round" />
  </g>
);
const GLOBE = (
  <g fill="none" stroke="currentColor" strokeWidth="1.9">
    <circle cx="12" cy="12" r="8.4" />
    <path d="M3.6 12h16.8M12 3.6c2.6 2.3 4 5.3 4 8.4s-1.4 6.1-4 8.4c-2.6-2.3-4-5.3-4-8.4s1.4-6.1 4-8.4Z" />
  </g>
);
const SPARKLE = (
  <path
    d="M12 3.2 13.7 9l5.8 1.7L13.7 12.4 12 18.2 10.3 12.4 4.5 10.7 10.3 9 12 3.2Zm6.4 8.6.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"
    fill="currentColor"
  />
);
const CODE = (
  <g fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="m8.5 8-4 4 4 4" />
    <path d="m15.5 8 4 4-4 4" />
  </g>
);
// YouTube — the rounded red badge with a white play triangle. Rendered on a red
// tile (bg below), so the badge is the white "card" + the brand-red triangle.
const PLAY = (
  <g>
    <rect x="2.4" y="5.6" width="19.2" height="12.8" rx="3.6" fill="#fff" />
    <path d="M10 9.1v5.8l5-2.9-5-2.9Z" fill="#FF0000" />
  </g>
);

const BRANDS: Record<string, Brand> = {
  google_maps: { bg: "#1A73E8", fg: "#fff", glyph: PIN },
  ga4: { bg: "#E37400", fg: "#fff", glyph: BARS },
  meta_pixel: { bg: "#0866FF", fg: "#fff", glyph: INFINITY },
  tiktok_pixel: { bg: "#111114", fg: "#fff", glyph: NOTE },
  linkedin_insight: { bg: "#0A66C2", fg: "#fff", glyph: IN },
  gtm: { bg: "#1C3D5A", fg: "#8AB4F8", glyph: TAG },
  captcha: { bg: "#F38020", fg: "#fff", glyph: SHIELD },
  stripe_connect: { bg: "#635BFF", fg: "#fff", glyph: STRIPE_S },
  email_domain: { bg: "#0F8A7E", fg: "#fff", glyph: ENVELOPE },
  custom_domain: { bg: "#475569", fg: "#fff", glyph: GLOBE },
  ai_provider: { bg: "#7C3AED", fg: "#fff", glyph: SPARKLE },
  custom_code: { bg: "#0F172A", fg: "#fff", glyph: CODE },
  youtube: { bg: "#FF0000", fg: "#fff", glyph: PLAY },
};

// Neutral fallback for any unmapped integration key (a plug icon).
const FALLBACK: Brand = {
  bg: "#64748B",
  fg: "#fff",
  glyph: (
    <path
      d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  ),
};

export function IntegrationLogo({
  integrationKey,
  size = 38,
  style,
}: {
  integrationKey: string;
  size?: number;
  style?: CSSProperties;
}) {
  const brand = BRANDS[integrationKey] ?? FALLBACK;
  const glyphSize = Math.round(size * 0.58);
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: brand.bg,
        color: brand.fg,
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), 0 1px 2px rgba(15,23,42,0.18)",
        ...style,
      }}
    >
      <svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24">
        {brand.glyph}
      </svg>
    </span>
  );
}

/** True if we have a dedicated brand tile (vs the neutral fallback). */
export function hasBrandLogo(integrationKey: string): boolean {
  return integrationKey in BRANDS;
}
