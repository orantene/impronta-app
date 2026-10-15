/**
 * TUL-1068 #11 + TUL-1063: the inquiry cart is one hub-wide `saved_talent` list,
 * so talent added on the directory silently showed up in the inquiry on another
 * talent's page. Each cart entry now remembers the CONTEXT it was added in
 * (the directory, or one talent page) and a surface only shows and sends the
 * entries of its own context. Membership stays in `saved_talent`; this module
 * only records where each id was added.
 */

/** Where an entry was added: the directory/hub, or one talent page (`t:<profileCode>`). */
export const DIRECTORY_SCOPE = "directory";

export type ScopeMap = Readonly<Record<string, readonly string[]>>;

/** `/t/<code>` and `/<locale>/t/<code>` are talent-page contexts; everything else is the directory. */
export function scopeKeyForPath(pathname: string | null | undefined): string {
  const m = /^\/(?:[a-z]{2}\/)?t\/([^/?#]+)/.exec(pathname ?? "");
  return m ? `t:${decodeURIComponent(m[1])}` : DIRECTORY_SCOPE;
}

/** Entries with no record (saved before scoping, or from the server) belong to the directory. */
export function inScope(map: ScopeMap, id: string, scope: string): boolean {
  const scopes = map[id];
  return scopes && scopes.length > 0 ? scopes.includes(scope) : scope === DIRECTORY_SCOPE;
}

export function addToScope(map: ScopeMap, id: string, scope: string): ScopeMap {
  const current = map[id] && map[id].length > 0 ? map[id] : [DIRECTORY_SCOPE];
  if (current.includes(scope)) return map;
  return { ...map, [id]: [...current, scope] };
}

/** `lastScope` is true when no context holds the entry any more, so the server row can go. */
export function removeFromScope(
  map: ScopeMap,
  id: string,
  scope: string,
): { map: ScopeMap; lastScope: boolean } {
  const current = map[id] && map[id].length > 0 ? map[id] : [DIRECTORY_SCOPE];
  const rest = current.filter((s) => s !== scope);
  const next: Record<string, readonly string[]> = { ...map };
  if (rest.length === 0) delete next[id];
  else next[id] = rest;
  return { map: next, lastScope: rest.length === 0 };
}

export function idsInScope(ids: readonly string[], map: ScopeMap, scope: string): string[] {
  return ids.filter((id) => inScope(map, id, scope));
}
