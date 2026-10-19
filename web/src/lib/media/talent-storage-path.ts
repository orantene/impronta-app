/**
 * Which storage objects a talent's portfolio actions may register or delete (TUL-1269).
 *
 * `registerPortfolioPhoto` used to store whatever `storagePath` the browser sent, and
 * `removePortfolioPhoto` later deleted that blob with the service role. A staff member of one
 * workspace could therefore register another talent's (or another tenant's) object and have it
 * removed. Object keys the editor really writes are `{talentId}/gallery/{uuid}.{ext}` (gallery
 * uploader) and `talent-portfolio/{talentId}/{uuid}.{ext}` (the documented layout); both start
 * with the talent's own id, so that is the rule.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,199}$/;

export function talentStoragePrefixes(talentId: string): string[] {
  return [`${talentId}/`, `talent-portfolio/${talentId}/`];
}

/** True only for a clean relative key under one of this talent's own prefixes. */
export function isTalentOwnedStoragePath(talentId: string, path: unknown): path is string {
  if (typeof path !== "string" || !UUID_RE.test(talentId)) return false;
  if (path.length === 0 || path.length > 512) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("%")) return false;
  const prefix = talentStoragePrefixes(talentId).find((p) => path.startsWith(p));
  if (!prefix) return false;
  const rest = path.slice(prefix.length).split("/");
  if (rest.length === 0 || rest.some((seg) => seg === "." || seg === ".." || !SEGMENT_RE.test(seg))) {
    return false;
  }
  return true;
}
