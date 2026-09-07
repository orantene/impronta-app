/**
 * seats-left.ts — "3 of 12 left" for a cohort, and when NOT to say it.
 *
 * Pure: no Supabase import, so it gates in CI and is testable without a
 * database. The reader beside it fetches; this decides and words.
 *
 *
 * A COHORT IS ONE POOL, NOT ONE PER NIGHT
 * ═══════════════════════════════════════
 * The Posing course sells twelve seats to a course, not twelve per session:
 * "two Saturday sessions, limited to 12 participants" is one cohort attending
 * both. Its pool is the OFFERING pool — `(offering, <offering id>, default)` —
 * and the sessions carry none. Counting per session would advertise 24 seats
 * for a room that holds 12, and both numbers would look right.
 *
 *
 * WHY THIS REFUSES TO SPEAK RATHER THAN GUESSING
 * ══════════════════════════════════════════════
 * `capacity_remaining_public` returns NULL for a pool that does not exist or is
 * switched off, and null is not zero. Rendering "0 left" for an offering with
 * no pool would tell a customer a course is full when nothing was ever limited,
 * and it is the more damaging error of the two: a wrongly sold-out course loses
 * the sale silently and nobody reports it. So an unknown count says nothing at
 * all, and the caller renders no badge.
 *
 *
 * WHY THERE IS NO "HURRY" NUMBER HERE
 * ═══════════════════════════════════
 * The obvious next request is to show the badge only under some threshold, to
 * make it scarce. That is a marketing decision about honesty and it does not
 * belong buried in a formatter; if it is wanted, it belongs where someone can
 * see and change it. This says what is true whenever it knows it.
 */

export type SeatsLocale = "en" | "es";

export type SeatsLeft =
  /** Nothing is known: no pool, or the pool is off. Render no badge. */
  | { kind: "unknown" }
  | { kind: "sold_out"; total: number }
  | { kind: "left"; remaining: number; total: number };

const COPY: Record<SeatsLocale, { soldOut: string; left: (r: number, t: number) => string }> = {
  en: {
    soldOut: "Sold out",
    left: (r, t) => `${r} of ${t} left`,
  },
  es: {
    soldOut: "Agotado",
    left: (r, t) => `Quedan ${r} de ${t}`,
  },
};

function pickLocale(raw?: string): SeatsLocale {
  return raw?.toLowerCase().startsWith("es") ? "es" : "en";
}

/**
 * Turn a remaining count and a pool size into what to show.
 *
 * `remaining` is what `capacity_remaining_public` returned: null when the pool
 * is absent or inactive. `total` is the pool's `units_total`.
 */
export function seatsLeft(
  remaining: number | null | undefined,
  total: number | null | undefined,
): SeatsLeft {
  if (remaining == null || total == null) return { kind: "unknown" };
  if (!Number.isFinite(remaining) || !Number.isFinite(total)) return { kind: "unknown" };
  // A pool of zero units is not a sold-out course, it is an unconfigured one.
  if (total <= 0) return { kind: "unknown" };
  const left = Math.max(0, Math.floor(remaining));
  if (left <= 0) return { kind: "sold_out", total: Math.floor(total) };
  // Remaining can exceed total only if the two were read at different moments
  // or the pool shrank under a live hold. Clamping keeps "13 of 12 left" off a
  // public page; it is a display, not an authority.
  return { kind: "left", remaining: Math.min(left, Math.floor(total)), total: Math.floor(total) };
}

/**
 * The sentence a customer reads, or null when nothing should be said.
 *
 * An unknown locale falls back to en rather than rendering a key or an empty
 * badge, matching `reminder-copy.ts`.
 */
export function describeSeatsLeft(state: SeatsLeft, locale?: string): string | null {
  if (state.kind === "unknown") return null;
  const copy = COPY[pickLocale(locale)];
  if (state.kind === "sold_out") return copy.soldOut;
  return copy.left(state.remaining, state.total);
}
