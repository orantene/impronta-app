/**
 * Isomorphic (no `server-only`) data shape for the canonical
 * `DirectoryCard`. Pulled out of `fetch.ts` so both server callers (the
 * Discover-bridge SSR seed) and client callers (`DirectoryCardAdapter`
 * mapping the public engine DTO) can share the same contract without
 * pulling server-only modules into the client bundle.
 *
 * Live exports here MUST stay pure / framework-free.
 */

/** One localized fit chip (taxonomy / discipline overlap label). */
export type DirectoryCardFitLabel = {
  slug: string;
  label: string;
};

/** One localized catalog trait line (key + label + value). */
export type DirectoryCardAttribute = {
  key: string;
  label: string;
  value: string;
};

export type DirectoryCardData = {
  id: string;
  name: string;
  /** Raw profile code (for inquiry actions). Null when unset. */
  profileCode: string | null;
  /** Final, tenant- + locale-prefixed `/t/<code>`. Empty when no code. */
  profileHref: string;
  primaryType: string | null;
  location: string | null;
  photoUrl: string | null;
  /**
   * Optional second photo for the `hover: "swap"` card behavior — crossfaded
   * in on hover when present. Surfaces that don't support swap leave it unset.
   */
  hoverPhotoUrl?: string | null;
  agencyName: string | null;
  isExclusive: boolean;
  /** Human availability line, or the ratified unknown fallback. */
  availabilityLabel: string;
  availabilityKnown: boolean;
  /** Days free in the next 30 (sort key); null = unknown. */
  availableDaysInNext30: number | null;
  /**
   * Optional editorial trait row data. Present when fed by the live engine
   * DTO (`/api/directory` + `/api/ai/search`); absent on the Path-A Discover
   * projection (which has no tag/attribute fields). The card adapter renders
   * a restrained subset (a couple of fit chips + a couple of catalog lines),
   * gated + ordered by the section's `cardFieldKeys` / `maxFieldLines` knobs.
   */
  fitLabels?: readonly DirectoryCardFitLabel[];
  cardAttributes?: readonly DirectoryCardAttribute[];
  /**
   * Craft standing signal (reviews). Mirrors `DirectoryCardDTO`'s
   * `ratingAvg` / `ratingCount` / `wouldBookAgainPct` — the loader NULLs
   * these for non-entitled tenants, so the entitlement gate stays
   * authoritative upstream. Absent/null here just means "don't render the
   * standing chip"; the credibility floor gate is applied by the renderer.
   */
  ratingAvg?: number | null;
  ratingCount?: number | null;
  wouldBookAgainPct?: number | null;
  /**
   * Pre-formatted, locale-aware "From $X" line (e.g. "From $850" /
   * "Desde $850"). Null = no public numeric pricing OR the section's
   * `showPriceFrom` knob is off — the renderer shows it iff present.
   */
  priceFromLabel?: string | null;
};

/** Ratified fallback string (Discover spec §5.4 / acceptance AV-2). */
export const AVAILABILITY_UNKNOWN =
  "Availability unknown, ask to confirm";
