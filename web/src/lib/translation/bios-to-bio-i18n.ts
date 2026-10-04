/**
 * Profile editor `bios` ({locale, text}[]) → `talent_profiles.bio_i18n` (PR 7).
 *
 * The profile editor writes the `bios` field-values blob; the public site reads
 * `bio_i18n`, which only the admin Translation Center used to write. So a
 * talent's own bio edits never reached their site. On every profile save the
 * bios are merged into `bio_i18n`: each non-blank locale in `bios` sets that
 * locale. A blank entry does NOT clear it: the editor pads `bios` with an empty
 * English row, which must not wipe a Translation Center bio.
 *
 * Pure; the IO wrapper is `sync-bios-to-bio-i18n.server.ts`.
 */
import { mergeI18n, toI18nMap } from "@/lib/i18n/i18n-columns";

export function biosToI18nPatch(
  bios: ReadonlyArray<{ locale: string; text: string | null | undefined }> | null | undefined,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const b of bios ?? []) {
    if (!b || typeof b.locale !== "string" || !b.locale) continue;
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (text) patch[b.locale] = text;
  }
  return patch;
}

/** The next `bio_i18n`, or null when nothing changes (skip the write). */
export function nextBioI18n(
  existing: unknown,
  bios: ReadonlyArray<{ locale: string; text: string | null | undefined }> | null | undefined,
): Record<string, string> | null {
  const before = toI18nMap(existing);
  const next = mergeI18n(before, biosToI18nPatch(bios));
  const same =
    Object.keys(before).length === Object.keys(next).length &&
    Object.entries(next).every(([k, v]) => before[k] === v);
  return same ? null : next;
}

/**
 * Read side (F25): the bio every surface shows. `bio_i18n` wins per locale;
 * the saved `bios` field value fills any locale it lacks, so a bio saved by
 * the talent drawer (which did not mirror to bio_i18n before) still shows.
 */
export function effectiveBioI18n(bioI18n: unknown, biosFieldValue: unknown): Record<string, string> {
  const base = toI18nMap(bioI18n);
  const rows = Array.isArray(biosFieldValue)
    ? (biosFieldValue as Array<{ locale?: unknown; text?: unknown } | null>).map((r) => ({
        locale: typeof r?.locale === "string" ? r.locale : "",
        text: typeof r?.text === "string" ? r.text : "",
      }))
    : [];
  return { ...biosToI18nPatch(rows), ...base };
}

/** The bio for `locale`, then English, then any saved locale. "" when none. */
export function pickBio(map: Readonly<Record<string, string>>, locale = "en"): string {
  return (map[locale] || map.en || Object.values(map).find((v) => v.trim()) || "").trim();
}
