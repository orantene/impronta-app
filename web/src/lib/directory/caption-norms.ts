/**
 * Differential card captions — show a field only when it SAYS something.
 *
 * Audit finding (live Impronta roster, 43 cards): 40 cards carried the
 * identical line "Available from Jul 26" (the roster has exactly 2 distinct
 * availability values), 34 shared one city, and 13 had a byte-identical
 * "Fashion Model · Playa del Carmen, MX" caption. Every card spent three
 * lines telling the client something true of ~90% of the grid, so the only
 * real selection signal left was the photo. The caption was decoration.
 *
 * The fix is selection, not more chrome: compute what is NORMAL for the
 * grid the visitor is actually looking at, then let each card drop the
 * fields where it merely agrees with everyone else. A card that differs —
 * a different city, availability nobody else has — keeps its line, and that
 * line now reads as a genuine differentiator instead of noise.
 *
 * Deliberately NOT normalized away: the talent's role/type. It varies enough
 * to be useful (the largest single role is ~37% of the roster) and it is the
 * one thing a client scans for first.
 *
 * Scope: norms are computed over the cards CURRENTLY loaded in the grid, so
 * they shift as the visitor filters — which is correct. "Playa del Carmen"
 * is noise on an all-Playa grid and signal on a mixed one.
 *
 * Pure + framework-free so both the server seed and the client grid share it.
 */

/** Share of cards that must agree before a value counts as "the norm". */
export const LOCATION_NORM_THRESHOLD = 0.6;
export const AVAILABILITY_NORM_THRESHOLD = 0.7;

/** Below this many cards, "normal" is meaningless — show everything. */
export const MIN_CARDS_FOR_NORMS = 6;

export type CaptionNorms = {
  /** Location label shared by most cards, or null when the grid is mixed. */
  dominantLocation: string | null;
  /** Availability label shared by most cards, or null when mixed. */
  dominantAvailability: string | null;
};

export const NO_CAPTION_NORMS: CaptionNorms = {
  dominantLocation: null,
  dominantAvailability: null,
};

function dominantValue(
  values: readonly (string | null | undefined)[],
  threshold: number,
): string | null {
  const counts = new Map<string, number>();
  let considered = 0;
  for (const raw of values) {
    const v = raw?.trim();
    if (!v) continue;
    considered++;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (considered === 0) return null;

  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  // Measure the majority against EVERY card in the grid, not just the ones
  // that had a value — otherwise three cards sharing a city out of forty
  // blanks would read as "the norm".
  return bestCount / values.length >= threshold ? best : null;
}

export function computeCaptionNorms(
  cards: readonly {
    locationLabel?: string | null;
    availabilityLabel?: string | null;
  }[],
): CaptionNorms {
  if (cards.length < MIN_CARDS_FOR_NORMS) return NO_CAPTION_NORMS;
  return {
    dominantLocation: dominantValue(
      cards.map((c) => c.locationLabel),
      LOCATION_NORM_THRESHOLD,
    ),
    dominantAvailability: dominantValue(
      cards.map((c) => c.availabilityLabel),
      AVAILABILITY_NORM_THRESHOLD,
    ),
  };
}

/** True when this card's value is just repeating what the grid already says. */
export function isRedundant(
  value: string | null | undefined,
  norm: string | null,
): boolean {
  if (!norm || !value) return false;
  return value.trim() === norm;
}
