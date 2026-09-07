/**
 * The code a first share proposes.
 *
 * First-share minting (CEO ruling 2026-09-05) means the operator's first Share
 * click creates the link — so something has to choose a code, and it has to be
 * one a person would be happy to see printed under a QR. `generateOpaqueCode`
 * is wrong here: opaque is for codes that GRANT, and a share link SHOWS.
 *
 * Derived from the thing's own name, because the operator recognises it
 * ("orlando-chair", not "k7m2xq9v"), it is short enough to type off a card, and
 * it makes the links list readable without a lookup.
 */
import { CODE_PATTERN } from "./code";

/**
 * There is deliberately NO reserved-word list.
 *
 * A first draft had one ("q", "admin", "api"...) on the assumption a code could
 * collide with a route. It cannot: every code lives under `/q/<code>`, so
 * `/q/admin` and `/q/q` are ordinary codes and shadow nothing. The guard was
 * protecting against a hazard that does not exist, and it refused perfectly
 * good names — a bar whose private room is called "Q" would have been told its
 * name was unusable.
 */
const MAX_LEN = 24;

/**
 * Slug a display name into a code shape: lowercase, hyphens, no accents.
 *
 * Accents are folded rather than dropped, so "Salón" becomes "salon" and not
 * "saln" — a code with a hole in the middle of a word is unrecognisable to the
 * operator who named the thing.
 */
export function slugifyForCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LEN)
    .replace(/-+$/g, "");
}

/**
 * A code for `name` that is not already taken on this tenant.
 *
 * Collisions get a numeric suffix rather than a random one: "orlando-chair-2"
 * tells an operator there are two, where "orlando-chair-k7f" tells them
 * nothing and looks like a mistake.
 *
 * Returns null when no acceptable code can be derived — an all-emoji name, or
 * one whose slug is empty. The caller must then ask the
 * operator rather than invent one: a code is going to be printed, and a
 * silently-invented one is a code nobody recognises on a card.
 */
export function suggestCode(name: string, taken: readonly string[]): string | null {
  const takenSet = new Set(taken.map((t) => t.toLowerCase()));
  const base = slugifyForCode(name);
  if (!base || !CODE_PATTERN.test(base)) return null;

  if (!takenSet.has(base)) return base;

  for (let n = 2; n <= 99; n += 1) {
    const trimmed = base.slice(0, MAX_LEN - String(n).length - 1).replace(/-+$/g, "");
    const candidate = `${trimmed}-${n}`;
    if (!takenSet.has(candidate) && CODE_PATTERN.test(candidate)) {
      return candidate;
    }
  }
  return null;
}
