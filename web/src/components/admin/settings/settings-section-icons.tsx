"use client";

/**
 * Section icon tiles for the workspace Settings accordion.
 *
 * Each settings section gets a small rounded tile + line glyph so the page
 * scans visually instead of as a wall of bold labels. Deliberately calmer than
 * the brand-coloured integration logos: a single soft-neutral tile with an
 * ink-muted glyph, so Settings reads as "your controls", not a logo wall.
 *
 * Keyed by the AccordionItem `id`. AccordionItem renders this from its own id —
 * no call-site changes needed. Unknown ids get a neutral gear fallback.
 * Inline SVG only (no dependency, CSP-safe).
 */

import type { ReactElement } from "react";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const GLYPH: Record<string, ReactElement> = {
  account: <g {...S}><path d="M5 20V6.5L12 3l7 3.5V20" /><path d="M3 20h18" /><path d="M9.5 20v-4h5v4" /><path d="M8.5 9.5h0M15.5 9.5h0M8.5 12.8h0M15.5 12.8h0" /></g>,
  plan: <g {...S}><rect x="3" y="5.5" width="18" height="13" rx="2.2" /><path d="M3 9.5h18" /><path d="M6.5 14.5h4" /></g>,
  workspace: <g {...S}><path d="M4 7h11M19 7h1M4 12h1M9 12h11M4 17h7M15 17h5" /><circle cx="17" cy="7" r="1.8" /><circle cx="7" cy="12" r="1.8" /><circle cx="13" cy="17" r="1.8" /></g>,
  "commercial-terms": <g {...S}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 16.5h4" /></g>,
  appointments: <g {...S}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3.5V7M16 3.5V7M4 10h16" /><path d="M8 14h3M13 14h3M8 17h3" /></g>,
  "pricing-defaults": <g {...S}><path d="M12 3v18" /><path d="M16.5 7.5c0-1.7-2-2.8-4.5-2.8S7.5 5.8 7.5 7.5s2 2.4 4.5 2.9 4.5 1.2 4.5 3-2 2.9-4.5 2.9-4.5-1.2-4.5-2.9" /></g>,
  domain: <g {...S}><circle cx="12" cy="12" r="8.4" /><path d="M3.6 12h16.8" /><path d="M12 3.6c2.4 2.2 3.8 5.2 3.8 8.4s-1.4 6.2-3.8 8.4c-2.4-2.2-3.8-5.2-3.8-8.4S9.6 5.8 12 3.6Z" /></g>,
  branding: <g {...S}><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-1 2.2-2 0-1.4-1.2-1.7-1.2-2.8 0-.8.7-1.4 1.6-1.4H16a4 4 0 0 0 4-4c0-4.2-3.6-7.8-8-7.8Z" /><circle cx="8" cy="11" r="1" /><circle cx="12" cy="8" r="1" /><circle cx="16" cy="11" r="1" /></g>,
  "media-watermark": <g {...S}><rect x="3.5" y="5" width="17" height="14" rx="2.2" /><circle cx="9" cy="10" r="1.6" /><path d="m4.5 17 4.5-4.5 3.5 3.5L16 12l4 4.5" /></g>,
  team: <g {...S}><circle cx="9" cy="9" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M16 6.5a3 3 0 0 1 0 5.6M16.5 14.2c2.6.4 4 2.3 4 4.8" /></g>,
  compliance: <g {...S}><path d="M12 3 5 5.5v5C5 15 8 18.6 12 20c4-1.4 7-5 7-9.5v-5L12 3Z" /><path d="m9 11.5 2 2 3.5-4" /></g>,
  "talent-types": <g {...S}><path d="M11.5 3.5 4 11a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0l7.5-7.5V3.5h-8Z" /><circle cx="16" cy="8" r="1.4" /></g>,
  // Settings nav — merged "Roster & profile fields" group (2026-07-24 flat
  // redesign): same tag glyph as talent-types, the group's anchor row.
  "roster-fields": <g {...S}><path d="M11.5 3.5 4 11a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0l7.5-7.5V3.5h-8Z" /><circle cx="16" cy="8" r="1.4" /></g>,
  "roster-review": <g {...S}><rect x="5.5" y="4" width="13" height="17" rx="2" /><path d="M9 4V2.8h6V4" /><path d="m8.5 12 2 2 4-4.5" /></g>,
  registration: <g {...S}><circle cx="9.5" cy="8" r="3" /><path d="M4 19c0-3 2.4-5 5.5-5 1 0 2 .2 2.8.7" /><path d="M17 13.5v6M14 16.5h6" /></g>,
  discover: <g {...S}><circle cx="12" cy="12" r="8.4" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></g>,
  integrations: <g {...S}><path d="M9 3v4M15 3v4M7 7h10v3.5a5 5 0 0 1-10 0V7ZM12 15.5V21" /></g>,
  brand: <g {...S}><path d="M12 3.5 14 9l6 .4-4.6 3.9 1.5 5.8L12 16l-5 3.1 1.5-5.8L4 9.4 10 9l2-5.5Z" /></g>,
  growth: <g {...S}><path d="M4 19h16" /><path d="m5 15 4-4 3 3 6-7" /><path d="M18 7h-3.5M18 7v3.5" /></g>,
  email: <g {...S}><rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.2" /><path d="m4 7 8 6 8-6" /></g>,
  features: <g {...S}><circle cx="8" cy="8" r="2.6" /><path d="M3 8h2.4M10.6 8H21" /><circle cx="16" cy="16" r="2.6" /><path d="M3 16h10.4M18.6 16H21" /></g>,
  danger: <g {...S}><path d="M12 3.5 21 19H3L12 3.5Z" /><path d="M12 10v4M12 16.6h0" /></g>,
  // Settings nav — "Advanced" (feature toggles, data tools, workspace deletion).
  advanced: <g {...S}><circle cx="12" cy="12" r="2.6" /><path d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.6 6.4l-1.7 1.7M8.1 15.9l-1.7 1.7M17.6 17.6l-1.7-1.7M8.1 8.1 6.4 6.4" /></g>,
  // Talent settings — "My Circle" (a tight ring of trusted collaborators).
  circle: <g {...S}><circle cx="12" cy="9" r="2.6" /><path d="M7 19c0-2.6 2.2-4.4 5-4.4s5 1.8 5 4.4" /><circle cx="5.2" cy="11.2" r="1.6" /><circle cx="18.8" cy="11.2" r="1.6" /><path d="M2.6 18c0-1.8 1.3-3 3-3M21.4 18c0-1.8-1.3-3-3-3" /></g>,
  // Talent settings — "Agencies" (the studios/agencies a talent belongs to).
  agencies: <g {...S}><path d="M4 20V8l5-3 5 3v12" /><path d="M14 20V11h6v9" /><path d="M3 20h18" /><path d="M7 9h0M7 12h0M11 9h0M11 12h0M17 14h0M17 17h0" /></g>,
  // Talent / client — "Personal page" (a published page with a person on it).
  "personal-page": <g {...S}><rect x="3.5" y="4.5" width="17" height="15" rx="2.2" /><path d="M3.5 8.5h17" /><circle cx="12" cy="13" r="1.9" /><path d="M8.8 17.6c.4-1.5 1.7-2.4 3.2-2.4s2.8.9 3.2 2.4" /></g>,
  // Client settings — "Profile" (the client's own person record).
  profile: <g {...S}><circle cx="12" cy="8.5" r="3.4" /><path d="M5 19.5c0-3.4 3.1-5.6 7-5.6s7 2.2 7 5.6" /></g>,
  // Client settings — "Notifications" (a bell).
  notifications: <g {...S}><path d="M6.5 16V10a5.5 5.5 0 0 1 11 0v6" /><path d="M4.5 16h15" /><path d="M10 19.2a2.2 2.2 0 0 0 4 0" /></g>,
  // Platform HQ — "Audit trail" (a time-stamped log / history).
  audit: <g {...S}><circle cx="12" cy="12" r="8.4" /><path d="M12 7.2V12l3.2 2" /></g>,
};

const FALLBACK: ReactElement = (
  <g {...S}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></g>
);

export function SettingsSectionIcon({
  sectionId,
  danger,
  size = 30,
  tone = "light",
}: {
  sectionId: string;
  danger?: boolean;
  size?: number;
  /**
   * Visual ground for the tile. `light` is the default neutral tile used on the
   * agency / talent / client (white-ground) settings surfaces. `dark` swaps in
   * a translucent tile + dimmed glyph so it sits calmly on the Platform HQ dark
   * theme (bg #0F0F11 / cards #16161A) instead of glaring as a light chip.
   */
  tone?: "light" | "dark";
}) {
  const glyph = GLYPH[sectionId] ?? FALLBACK;
  const glyphSize = Math.round(size * 0.62);
  const isDark = tone === "dark";
  const background = danger
    ? isDark
      ? "rgba(220,38,38,0.14)"
      : "#FEF2F2"
    : isDark
      ? "rgba(255,255,255,0.06)"
      : "#F1F4F8";
  const color = danger
    ? isDark
      ? "#F4A8A8"
      : "#DC2626"
    : isDark
      ? "rgba(245,242,235,0.62)"
      : "#5B6473";
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background,
        color,
        flexShrink: 0,
        boxShadow: isDark
          ? "inset 0 0 0 1px rgba(255,255,255,0.08)"
          : "inset 0 0 0 1px rgba(15,23,42,0.05)",
      }}
    >
      <svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24">
        {glyph}
      </svg>
    </span>
  );
}
