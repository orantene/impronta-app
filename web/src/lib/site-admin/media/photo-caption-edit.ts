/**
 * Photo caption edit rule (TUL-229). Pure, no IO.
 *
 * The public site reads `media_assets.metadata.caption` (primary language) and
 * `metadata.caption_i18n.<locale>` (every other language); see
 * `builder-node/portfolio-i18n.ts`. This is the one place that WRITES them:
 *
 *   - primary language   -> `metadata.caption`
 *   - any other language -> `metadata.caption_i18n.<locale>`
 *
 * The primary is never written into `caption_i18n` (the resolver would then
 * carry two copies that can drift). Text is trimmed and capped; an empty value
 * removes the key (and the whole map when it empties). Every other metadata key
 * (`alt_i18n`, `albumId`, `note`, ...) is carried through untouched.
 */

export const PHOTO_CAPTION_MAX_CHARS = 200;

export type PhotoMetadata = Record<string, unknown>;

function localeKey(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/** Trim and cap one caption; "" means "no caption". */
export function normalizePhotoCaption(text: string | null | undefined): string {
  return (text ?? "").trim().slice(0, PHOTO_CAPTION_MAX_CHARS).trim();
}

function readMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

/**
 * Returns a NEW metadata object with `text` applied for `locale`. `metadata`
 * may be null (a photo with no metadata yet). The input is never mutated.
 */
export function applyCaptionEdit(
  metadata: PhotoMetadata | null | undefined,
  locale: string,
  primaryLocale: string,
  text: string,
): PhotoMetadata {
  const next: PhotoMetadata = { ...(metadata ?? {}) };
  const value = normalizePhotoCaption(text);
  const loc = localeKey(locale);
  const primary = localeKey(primaryLocale);

  if (!loc || loc === primary) {
    if (value) next.caption = value;
    else delete next.caption;
    return next;
  }

  const map = readMap(next.caption_i18n);
  if (value) map[loc] = value;
  else delete map[loc];
  if (Object.keys(map).length > 0) next.caption_i18n = map;
  else delete next.caption_i18n;
  return next;
}

/** A blur with no change must not cost a request. */
export function captionNeedsSave(stored: string | null | undefined, draft: string): boolean {
  return normalizePhotoCaption(draft) !== (stored ?? "").trim();
}

/** What the editor shows per language, read back from stored metadata. */
export function readCaptionDrafts(
  metadata: PhotoMetadata | null | undefined,
  locales: readonly string[],
  primaryLocale: string,
): Record<string, string> {
  const primary = localeKey(primaryLocale);
  const map = readMap(metadata?.caption_i18n);
  const out: Record<string, string> = {};
  for (const l of locales) {
    const k = localeKey(l);
    out[k] =
      k === primary
        ? typeof metadata?.caption === "string"
          ? metadata.caption
          : ""
        : (map[k] ?? "");
  }
  return out;
}
