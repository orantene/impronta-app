/** Prototype-only local preferences (localStorage). Not used by live admin or CMS. */

export const ADMIN_PROTOTYPE_PINNED_KEY = "admin_prototype_pinned_items";
export const ADMIN_PROTOTYPE_TOP_SHORTCUTS_KEY = "admin_prototype_top_shortcuts";

function parseIdList(raw: string | null): string[] {
  if (raw == null || raw === "") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function loadPinnedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseIdList(localStorage.getItem(ADMIN_PROTOTYPE_PINNED_KEY));
  } catch {
    return [];
  }
}

export function savePinnedIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADMIN_PROTOTYPE_PINNED_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function loadTopShortcutIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseIdList(localStorage.getItem(ADMIN_PROTOTYPE_TOP_SHORTCUTS_KEY));
  } catch {
    return [];
  }
}

export function saveTopShortcutIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADMIN_PROTOTYPE_TOP_SHORTCUTS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function togglePinnedId(current: string[], id: string): string[] {
  const set = new Set(current);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set];
}

/** Append when adding; preserve order when removing. */
export function toggleTopShortcutId(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  return [...current, id];
}
