/**
 * Pure helpers for the client hub (TUL-63): focus sort + hub-open rule.
 * No DB / server-only imports so they are unit-testable.
 */

export function normaliseFocus(focus: string | null | undefined): string | null {
  const f = (focus ?? "").trim().toUpperCase();
  return f ? f : null;
}

/** Stable: items whose talentCodes include `focus` first, relative order kept. */
export function sortByFocus<T extends { talentCodes: string[] }>(
  items: T[],
  focus: string | null | undefined,
): T[] {
  const f = normaliseFocus(focus);
  if (!f) return items;
  const hit: T[] = [];
  const rest: T[] = [];
  for (const it of items) {
    (it.talentCodes.some((c) => c.toUpperCase() === f) ? hit : rest).push(it);
  }
  return [...hit, ...rest];
}

/** Hub is open when the client-account flag is on for the app host, or the client is paid. */
export function hubIsOpen(flagOn: boolean, tier: string | null | undefined): boolean {
  return flagOn || tier === "pro" || tier === "enterprise";
}
