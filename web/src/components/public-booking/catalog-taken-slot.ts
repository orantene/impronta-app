/**
 * DS-4: taken-slot recovery. When a confirm finds the picked time gone, the
 * sheet returns to the time step and must say so THERE (not only on the details
 * step) and offer the nearest times that still fit the full duration. Pure.
 */

export interface CatalogTakenSlotNotice {
  /** Plain-language line, shown as `role="alert"` on the time step. */
  message: string;
  /** The ISO start that was lost, used to rank alternatives. `null` for demo picks. */
  lostStarts: string | null;
}

/** How many alternative times the notice offers. */
export const CATALOG_ALTERNATIVE_COUNT = 3;

/** "Las 10:00 se acaban de ocupar." when the clock is known, else the server text. */
export function catalogTakenSlotMessage(input: {
  locale: string;
  lostClock: string | null;
  serverMessage: string;
}): string {
  if (!input.lostClock) return input.serverMessage;
  return input.locale.toLowerCase().startsWith("es")
    ? `Las ${input.lostClock} se acaban de ocupar. Estas horas sí te caben:`
    : `${input.lostClock} was just taken. These times still fit:`;
}

/**
 * The `limit` open starts nearest to the lost one, returned in chronological
 * order. `openStarts` must already be the projected list for the FULL booking
 * duration, so every entry fits.
 */
export function catalogNearestStarts(
  lostStarts: string | null,
  openStarts: readonly string[],
  limit: number = CATALOG_ALTERNATIVE_COUNT,
): string[] {
  const pool = openStarts.filter((iso) => iso !== lostStarts);
  if (pool.length === 0) return [];
  const anchor = lostStarts ? Date.parse(lostStarts) : Number.NaN;
  const ranked = Number.isFinite(anchor)
    ? [...pool].sort((a, b) => Math.abs(Date.parse(a) - anchor) - Math.abs(Date.parse(b) - anchor))
    : [...pool].sort((a, b) => Date.parse(a) - Date.parse(b));
  return ranked.slice(0, limit).sort((a, b) => Date.parse(a) - Date.parse(b));
}
