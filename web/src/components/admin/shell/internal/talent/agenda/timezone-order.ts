/**
 * TUL-821: the time zone list leads with the Mexico zones (the first market),
 * then everything else. Pure, so it is testable in a node lane.
 */
export const MEXICO_ZONES = [
  "America/Cancun",
  "America/Mexico_City",
  "America/Merida",
  "America/Monterrey",
  "America/Chihuahua",
  "America/Mazatlan",
  "America/Hermosillo",
  "America/Tijuana",
] as const;

export function orderTimeZones(zones: readonly string[]): { suggested: string[]; rest: string[] } {
  const have = new Set(zones);
  const suggested = MEXICO_ZONES.filter((z) => have.has(z));
  const pinned = new Set<string>(suggested);
  return { suggested, rest: zones.filter((z) => !pinned.has(z)) };
}
