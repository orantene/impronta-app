/** Owner chips show only when a catalog mixes offerings from more than one person. */
export function showOwnerChips(rows: readonly { readonly ownerName?: string | null }[]): boolean {
  const names = new Set<string>();
  for (const r of rows) if (r.ownerName) names.add(r.ownerName);
  return names.size > 1;
}
