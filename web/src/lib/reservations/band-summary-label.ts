/**
 * TUL-1923: one table-group entry of the "What you can seat" summary.
 *
 * The group's name is often already a size range ("Mesas de 1 a 4"), and the
 * summary used to append its numbers again: "Mesas de 1 a 4 (1 a 4)". When the
 * name already carries both the smallest and largest party as whole numbers,
 * the parenthetical is dropped; otherwise it is kept ("Terraza (2 a 6)").
 */
export function bandSummaryLabel(
  band: { name: string; partyMin: number; partyMax: number },
  es: boolean,
): string {
  const name = band.name.trim();
  const numbers = new Set(name.match(/\d+/g)?.map(Number) ?? []);
  if (numbers.has(band.partyMin) && numbers.has(band.partyMax)) return name;
  return `${name} (${band.partyMin} ${es ? "a" : "to"} ${band.partyMax})`;
}
