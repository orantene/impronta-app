"use client";

/**
 * WF-6 — the operator-facing vocabulary for the header REGIONS editor.
 *
 * The schema speaks in enums (`wordmark`, `menu`, `priority: 90`). The owner's
 * bar is "a new user must understand it without a manual", so nothing in this
 * file surfaces an enum value: every kind, zone and breakpoint behaviour has a
 * plain-language name and one line saying what it does.
 *
 * It lives apart from `RegionsTab.tsx` so the tab stays a layout file and this
 * stays a vocabulary file. Every literal below reaches the operator through an
 * inspector-kit boundary prop, so each one has a Spanish entry in
 * `editor-i18n-es-inspectors-2.ts` (enforced by
 * `es-parity-inspectors.static.test.ts`).
 */

import type {
  HeaderItemKind,
  HeaderZone,
} from "@/lib/site-admin/sections/site_header/regions-editing";

// ── Zones ───────────────────────────────────────────────────────────────────

export const ZONE_META: Record<
  HeaderZone,
  { label: string; description: string }
> = {
  left: {
    label: "Left side",
    description: "Sits against the left edge of the bar.",
  },
  center: {
    label: "Center",
    description: "Stays optically centred, whatever sits either side of it.",
  },
  right: {
    label: "Right side",
    description: "Sits against the right edge of the bar.",
  },
};

// ── Item kinds ──────────────────────────────────────────────────────────────

export const ITEM_META: Record<
  HeaderItemKind,
  { label: string; description: string }
> = {
  logo: {
    label: "Logo",
    description: "Your logo image, linked to the home page.",
  },
  wordmark: {
    label: "Business name",
    description: "Your business name set as text.",
  },
  nav: {
    label: "Menu links",
    description: "The list of page links you manage on the Navigation tab.",
  },
  cta: {
    label: "Main button",
    description: "Your primary call to action, shown as a filled button.",
  },
  inquiry: {
    label: "Inquiry basket",
    description: "Icon that opens the visitor's inquiry, with a live count.",
  },
  saved: {
    label: "Saved talent",
    description: "Icon that opens the visitor's saved talent, with a count.",
  },
  social: {
    label: "Social icons",
    description: "A row of icons for the social accounts you have filled in.",
  },
  phone: {
    label: "Phone number",
    description: "Your phone number, tap to call on a mobile.",
  },
  language: {
    label: "Language switch",
    description: "The language codes a visitor can switch between.",
  },
  spacer: {
    label: "Flexible gap",
    description: "Empty space that pushes whatever follows it further along.",
  },
};

// ── Per-breakpoint behaviour ────────────────────────────────────────────────

/**
 * `undefined` is a real, useful state here: it means "let the header decide",
 * which is how every seeded item starts. So it gets a name of its own rather
 * than being hidden behind a value that looks chosen.
 */
export const BEHAVIOUR_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "", label: "Automatic" },
  { value: "show", label: "Icon and text" },
  { value: "label", label: "Text only" },
  { value: "icon", label: "Icon only" },
  { value: "hide", label: "Hidden" },
  { value: "menu", label: "Inside the menu" },
];

export const BREAKPOINT_ROWS: ReadonlyArray<{
  key: "desktop" | "tablet" | "mobile";
  label: string;
  hint: string;
}> = [
  {
    key: "desktop",
    label: "On desktop",
    hint: "Wide screens. Automatic shows the icon and the text.",
  },
  {
    key: "tablet",
    label: "On tablet",
    hint: "Automatic copies whatever you chose for desktop.",
  },
  {
    key: "mobile",
    label: "On phone",
    hint: "Automatic keeps the logo in the bar and moves everything else into the menu.",
  },
];

// ── Overflow priority, as three plain choices ───────────────────────────────

/**
 * The schema stores 0 to 100. Three named tiers is what the decision actually
 * is ("who gives way when the bar runs out of room"), and a number field would
 * make the operator invent a scale nobody documented.
 */
export const PRIORITY_TIERS: ReadonlyArray<{
  value: string;
  label: string;
  number: number;
}> = [
  { value: "low", label: "Give way first", number: 20 },
  { value: "normal", label: "Normal", number: 50 },
  { value: "high", label: "Keep as long as possible", number: 90 },
];

export function priorityTierOf(priority: number | undefined): string {
  if (priority === undefined) return "normal";
  if (priority <= 30) return "low";
  if (priority >= 70) return "high";
  return "normal";
}

export function priorityNumberFor(tier: string): number {
  return PRIORITY_TIERS.find((t) => t.value === tier)?.number ?? 50;
}

// ── Glyphs ──────────────────────────────────────────────────────────────────

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** One 16px glyph per item kind, so a zone list is scannable without reading. */
export function ItemGlyph({ kind }: { kind: HeaderItemKind }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...STROKE} aria-hidden>
      {kind === "logo" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="9" cy="10" r="2" />
          <path d="M4 18l5-4 4 3 3-2 4 3" />
        </>
      ) : null}
      {kind === "wordmark" ? (
        <>
          <path d="M5 7h14" />
          <path d="M12 7v10" />
        </>
      ) : null}
      {kind === "nav" ? (
        <>
          <path d="M4 8h6" />
          <path d="M14 8h6" />
          <path d="M4 16h6" />
          <path d="M14 16h6" />
        </>
      ) : null}
      {kind === "cta" ? (
        <>
          <rect x="3" y="8" width="18" height="8" rx="4" />
          <path d="M9 12h6" />
        </>
      ) : null}
      {kind === "inquiry" ? (
        <>
          <path d="M6 8h12l-1 11H7L6 8z" />
          <path d="M9 8a3 3 0 0 1 6 0" />
        </>
      ) : null}
      {kind === "saved" ? (
        <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" />
      ) : null}
      {kind === "social" ? (
        <>
          <circle cx="6" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="18" cy="12" r="2" />
        </>
      ) : null}
      {kind === "phone" ? (
        <path d="M6 4h3l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4 6.2 2 2 0 0 1 6 4z" />
      ) : null}
      {kind === "language" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16" />
          <path d="M12 4a13 13 0 0 1 0 16a13 13 0 0 1 0-16z" />
        </>
      ) : null}
      {kind === "spacer" ? (
        <>
          <path d="M4 6v12" />
          <path d="M20 6v12" />
          <path d="M8 12h8" />
          <path d="M8 12l2-2M8 12l2 2M16 12l-2-2M16 12l-2 2" />
        </>
      ) : null}
    </svg>
  );
}
