/**
 * Locale resolution for compare-table text.
 *
 * A separate module ON PURPOSE: `get-compare-table.ts` pulls in the
 * service-role client, which imports `server-only`, and that kills a pure
 * `tsx --test` lane at load. Keeping the resolver here means the behaviour
 * below can be tested without a server runtime.
 */

/**
 * A locale map as it arrives from the database: `jsonb`, which is `unknown`
 * shaped. Typing it as a Record would be a claim about data the database does
 * not enforce, so the narrowing happens here instead of at the cast site.
 */
export type LocaleMap = unknown;

/**
 * Read a locale map, falling back to the English column.
 *
 * The fallback is the load-bearing part. A blank cell in a pricing table does
 * not read as "not translated yet", it reads as "this plan does not include
 * it". So a missing translation must degrade to English and never to empty, or
 * a content gap silently becomes a false product claim.
 *
 * Empty and whitespace-only strings count as missing. They are the dangerous
 * case: the key is present, so a plain `?? fallback` keeps them and the cell
 * renders blank.
 */
export function pickLabel(
  map: LocaleMap,
  fallback: string,
  locale: string,
): string {
  if (typeof map !== "object" || map === null || Array.isArray(map)) {
    return fallback;
  }
  const value = (map as Record<string, unknown>)[locale];
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}
