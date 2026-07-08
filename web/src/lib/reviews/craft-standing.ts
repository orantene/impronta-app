/**
 * Craft standing — a pure, deterministic view of a talent's review signal.
 *
 * Turns the raw rating aggregates (count, average, would-book-again %) into a
 * small "standing tier" plus human-readable copy. No DB / server imports: this
 * module is safe to use on the client, in DTO mappers, and in tests. The
 * heuristic is intentionally simple and forgiving so a talent with a handful of
 * strong reviews is not under-credited.
 */

export type StandingTier = "new" | "rising" | "established" | "signature";

/** Minimum published reviews before a standing signal is credible. */
export const STANDING_MIN_COUNT = 3;

/**
 * Deterministic standing tier from rating aggregates.
 *
 * - Below the credibility floor (`STANDING_MIN_COUNT`) -> 'new'.
 * - Strong volume + excellence (>=8 reviews and avg>=4.8) -> 'signature'.
 * - Solid quality (avg>=4.5) with satisfied clients (would-book-again unknown
 *   or >=80%) -> 'established'.
 * - Otherwise, past the floor -> 'rising'.
 */
export function computeStandingTier(input: {
  ratingCount: number;
  ratingAvg: number;
  wouldBookAgainPct: number | null;
}): StandingTier {
  const { ratingCount, ratingAvg, wouldBookAgainPct } = input;

  if (ratingCount < STANDING_MIN_COUNT) return "new";

  if (ratingCount >= 8 && ratingAvg >= 4.8) return "signature";

  const bookAgainOk = wouldBookAgainPct == null || wouldBookAgainPct >= 80;
  if (ratingAvg >= 4.5 && bookAgainOk) return "established";

  return "rising";
}

/** Short, client-facing label for a standing tier. */
export function standingTierLabel(t: StandingTier): string {
  switch (t) {
    case "new":
      return "New talent";
    case "rising":
      return "Rising";
    case "established":
      return "Established";
    case "signature":
      return "Signature";
  }
}

/**
 * Whether a talent has enough published reviews for the standing signal to be
 * shown as credible. Defaults to `STANDING_MIN_COUNT`.
 */
export function meetsCredibilityFloor(
  ratingCount: number | null | undefined,
  minCount: number = STANDING_MIN_COUNT,
): boolean {
  return (ratingCount ?? 0) >= minCount;
}

/**
 * Human-readable "would book again" phrase, or null when there is no usable
 * signal. Small-sample perfect scores read as a concrete count ("N of N
 * clients would book again"); larger samples read as a percentage.
 */
export function wouldBookAgainPhrase(
  ratingCount: number | null | undefined,
  wouldBookAgainPct: number | null | undefined,
): string | null {
  const count = ratingCount ?? 0;
  if (count <= 0 || wouldBookAgainPct == null) return null;

  if (count < 8 && wouldBookAgainPct === 100) {
    return `${count} of ${count} clients would book again`;
  }

  if (count >= 8) {
    return `${Math.round(wouldBookAgainPct)}% would book again`;
  }

  return `${Math.round(wouldBookAgainPct)}% of clients would book again`;
}
