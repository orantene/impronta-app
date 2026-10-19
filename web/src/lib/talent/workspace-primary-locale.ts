/**
 * The language a workspace's Menu items are written in: the business identity's
 * `default_locale`, normalised to a short code, English when unset.
 *
 * `offeringToRowPatch` stores the plain `title` column as the PRIMARY language
 * and `title_i18n[primary]` beside it. Menu actions hard-coded "en", so a
 * Spanish title typed into a Spanish workspace was stored under the `en` key
 * (Services Phase 0 item 5d).
 */
export function normalizeWorkspaceLocale(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase().split(/[-_]/)[0] : "";
  return s && /^[a-z]{2,3}$/.test(s) ? s : "en";
}
