/** Pure helpers for promote-early-inquiry.ts (kept apart so they are testable without the engine). */

/** The talent ids an early guest row was opened for: interpreted_query.talent.selected_ids. */
export function selectedTalentIds(interpretedQuery: unknown): string[] {
  const talent = (interpretedQuery as { talent?: { selected_ids?: unknown } } | null)?.talent;
  const ids = talent?.selected_ids;
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()))];
}

/**
 * True once the row's contact is the guest's own, not the synthetic seed that
 * ensureGuestChatInquiry writes ("Guest" / `pending-<session>@guest.impronta`).
 */
export function hasRealGuestContact(email: string | null | undefined, name: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return false;
  if (/^pending-.+@guest\.impronta$/.test(e)) return false;
  return (name ?? "").trim().length > 0;
}
