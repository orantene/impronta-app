/**
 * Roster-card badge preferences — per-workspace contract.
 *
 * The admin Roster grid renders a stack of overlay "badges" on each talent
 * card: the live visibility eye (roster-only), the Discover pill, the trust
 * marks, profile completeness, photo count, availability, and the TAL-ID.
 * A workspace admin can show/hide each of these from the Card Design studio
 * (surface = "roster"). The choice persists per-tenant in
 * `agencies.settings.rosterCardBadges` (JSONB — no dedicated column / no
 * migration) and is seeded SSR-side through the admin bridge so the roster
 * renders with the right badges on first paint (no flash).
 *
 * This module is intentionally framework-free (no `"use client"` /
 * `"server-only"`): the server action, the bridge loader, the shell context,
 * the roster card, and the studio all import it.
 */

// ───────────────────────────────────────────────────────────────────────────
// Keys
// ───────────────────────────────────────────────────────────────────────────

/**
 * Every configurable overlay element on an admin roster card.
 *
 *   - `visibility`   — the live show/hide eye toggle. ROSTER-ONLY control;
 *                      hiding the *badge* only hides the affordance, it does
 *                      not change a talent's published visibility.
 *   - `trust`        — verified / trust marks (photo-overlay icons).
 *   - `discover`     — the "Discover" pill (talent opted into Tulala
 *                      Discover).
 *   - `completeness` — profile-completeness percentage.
 *   - `photoCount`   — total gallery photo count (turns critical at 0).
 *   - `availability` — availability pill.
 *   - `talentId`     — the TAL-ID / public profile code chip.
 */
export const ROSTER_CARD_BADGE_KEYS = [
  "visibility",
  "trust",
  "discover",
  "completeness",
  "photoCount",
  "availability",
  "talentId",
] as const;

export type RosterCardBadgeKey = (typeof ROSTER_CARD_BADGE_KEYS)[number];

/** Show/hide state for every roster-card badge. */
export type RosterCardBadgePrefs = Record<RosterCardBadgeKey, boolean>;

/** Default: every badge visible. */
export const DEFAULT_ROSTER_CARD_BADGES: RosterCardBadgePrefs = {
  visibility: true,
  trust: true,
  discover: true,
  completeness: true,
  photoCount: true,
  availability: true,
  talentId: true,
};

// ───────────────────────────────────────────────────────────────────────────
// Studio metadata
// ───────────────────────────────────────────────────────────────────────────

export interface RosterCardBadgeMeta {
  key: RosterCardBadgeKey;
  /** Studio row label. */
  label: string;
  /** One-line studio description of what the badge surfaces. */
  description: string;
  /**
   * When true, the studio shows a caution note while the badge is hidden —
   * used for `visibility`, where hiding the eye removes the only inline
   * control for taking a talent off the agency site.
   */
  warnOnHide?: boolean;
}

/**
 * Studio copy for each badge, in display order. The studio iterates this
 * array so a new key is surfaced automatically once it is added here.
 */
export const ROSTER_CARD_BADGE_META: readonly RosterCardBadgeMeta[] = [
  {
    key: "visibility",
    label: "Visibility eye",
    description:
      "The live show / hide control for the agency site. Roster only.",
    warnOnHide: true,
  },
  {
    key: "trust",
    label: "Trust marks",
    description: "Verified and trust badges on the talent photo.",
  },
  {
    key: "discover",
    label: "Discover pill",
    description: "Shows when a talent has opted into Tulala Discover.",
  },
  {
    key: "completeness",
    label: "Profile completeness",
    description: "Percentage of the profile that is filled in.",
  },
  {
    key: "photoCount",
    label: "Photo count",
    description: "Total gallery photos. Turns red when there are none.",
  },
  {
    key: "availability",
    label: "Availability",
    description: "The talent's current availability pill.",
  },
  {
    key: "talentId",
    label: "TAL-ID",
    description: "The public profile code chip (e.g. TAL-0042).",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Normalization
// ───────────────────────────────────────────────────────────────────────────

/**
 * Coerce an untrusted value (JSONB from `agencies.settings`, a partial action
 * payload, etc.) into a complete, well-typed `RosterCardBadgePrefs`. Unknown
 * keys are dropped; missing keys fall back to the default (visible); only
 * strict booleans override a default, so a malformed entry can never silently
 * hide a badge.
 */
export function normalizeRosterCardBadges(raw: unknown): RosterCardBadgePrefs {
  const next: RosterCardBadgePrefs = { ...DEFAULT_ROSTER_CARD_BADGES };
  if (!raw || typeof raw !== "object") return next;
  const source = raw as Record<string, unknown>;
  for (const key of ROSTER_CARD_BADGE_KEYS) {
    const value = source[key];
    if (typeof value === "boolean") next[key] = value;
  }
  return next;
}
