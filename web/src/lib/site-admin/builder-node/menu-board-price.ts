/**
 * menu-board-price.ts: price facts for a menu board line that the catalog can
 * state but the dish row cannot (TUL-1801).
 *
 * A dish sold by size ("Platillo por tamaño": Chico 60, Grande 90) has NO price
 * of its own: the row is `amountCents = null`, so the board showed "Quote on
 * request" beside two priced options. The honest label is "from" the lowest
 * priced option. A dish whose options carry no price at all stays a quote.
 */

export type MenuOptionPrice = { amountCents: number | null };

/** Lowest positive option price, or null when no option states one. */
export function lowestOptionCents(
  options: ReadonlyArray<MenuOptionPrice> | null | undefined,
): number | null {
  let low: number | null = null;
  for (const o of options ?? []) {
    const c = o.amountCents;
    if (typeof c === "number" && Number.isFinite(c) && c > 0 && (low === null || c < low)) low = c;
  }
  return low;
}

/** Locale for the board's words: the content locale, else the visitor's, else English. */
export function menuBoardLocale(
  contentLocale: string | null | undefined,
  visitorLocale: string | null | undefined,
): string {
  return contentLocale?.trim() || visitorLocale?.trim() || "en";
}
