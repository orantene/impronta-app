/**
 * Talent media albums (System-B blob `media_albums_data`), normalised. Pure,
 * shared by the editor's chapter picker and the theme preview's chapter fill.
 */
export type TalentMediaAlbumOption = {
  id: string;
  name: string;
  sortOrder: number;
};

export function normalizeTalentMediaAlbums(raw: unknown): TalentMediaAlbumOption[] {
  if (!Array.isArray(raw)) return [];
  const out: TalentMediaAlbumOption[] = [];
  for (const [i, row] of raw.entries()) {
    if (!row || typeof row !== "object") continue;
    const r = row as { id?: unknown; name?: unknown; sortOrder?: unknown };
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!id || !name) continue;
    out.push({
      id,
      name,
      sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : i,
    });
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
