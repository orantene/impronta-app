/**
 * The LOOK LAYER: which site token keys a Look owns (pure, client-safe).
 *
 * A Look owns every colour, every typography key and the page background mode.
 * Applying a Look therefore REPLACES that whole layer in the site's draft
 * tokens (a key the new Look omits falls back to the platform default rather
 * than leaking from the previous Look) and never touches keys outside it
 * (radius, shadow, spacing, motion, ... stay as the talent left them).
 *
 * Rule, stated once because it is easy to get backwards: a Look is a colour +
 * font PAIR, so a Look that sets only colours still clears the previous Look's
 * font overrides. Splitting fonts into their own pick is the `kind` column's
 * job later (palette / typography), not a special case here.
 */

export const LOOK_OWNED_TOKEN_PREFIXES = ["color.", "typography."] as const;
export const LOOK_OWNED_TOKEN_KEYS = ["background.mode"] as const;

export function isLookOwnedTokenKey(key: string): boolean {
  return (
    LOOK_OWNED_TOKEN_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    (LOOK_OWNED_TOKEN_KEYS as ReadonlyArray<string>).includes(key)
  );
}

/** Keys every Look must set explicitly so its contrast is checkable. */
export const LOOK_REQUIRED_TOKEN_KEYS = [
  "color.background",
  "color.ink",
  "color.primary",
] as const;

/**
 * Layer-scoped merge: drop every Look-owned key from `draft`, then add the
 * Look's tokens. Keys outside the Look layer are preserved. Pure; returns a
 * new object, never mutates either input.
 */
export function mergeLookIntoTokens(
  draft: Readonly<Record<string, string>>,
  lookTokens: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (!isLookOwnedTokenKey(key)) out[key] = value;
  }
  for (const [key, value] of Object.entries(lookTokens)) {
    if (isLookOwnedTokenKey(key)) out[key] = value;
  }
  return out;
}
