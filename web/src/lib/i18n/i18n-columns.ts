/**
 * Plain column + `*_i18n` map pairs (talent content translations).
 *
 * Convention: the plain column always holds the PRIMARY-language value; the
 * `_i18n` map holds every language, including the primary. Rows written before
 * a map existed have an empty map, so every read falls back to the plain column.
 *
 * Pure (no IO), built on `resolve-localized.ts`.
 */
import type { Locale } from "@/i18n/config";
import { resolveLocalized, setLocalized, type LocalizedMap } from "./resolve-localized";

/** Clean string-only copy of an unknown jsonb value (drops non-strings and blanks). */
export function toI18nMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) out[k] = t;
  }
  return out;
}

/**
 * Best value for `locale`: the map walked along `chain`, then the plain column,
 * then any populated locale in the map. Returns "" only when everything is empty.
 */
export function readI18n(
  map: unknown,
  plain: string | null | undefined,
  locale: Locale,
  chain: readonly Locale[] = [locale],
): string {
  const clean = toI18nMap(map);
  const exact = clean[locale];
  if (exact) return exact;
  for (const code of chain) {
    if (clean[code]) return clean[code];
  }
  const p = typeof plain === "string" ? plain.trim() : "";
  if (p) return p;
  return resolveLocalized(clean, locale, chain).value;
}

/** Merge a patch into a map. Empty / blank patch values delete that locale. */
export function mergeI18n(
  existing: unknown,
  patch: LocalizedMap | null | undefined,
): Record<string, string> {
  let next: LocalizedMap = toI18nMap(existing);
  for (const [k, v] of Object.entries(patch ?? {})) {
    next = setLocalized(next, k, typeof v === "string" ? v : "");
  }
  return toI18nMap(next);
}

/**
 * The map to write next to a plain column: every other language survives and
 * `map[primary]` equals `plain` (an empty `plain` deletes the primary entry).
 */
export function i18nPair(
  map: unknown,
  plain: string | null | undefined,
  primary: Locale,
): Record<string, string> {
  return mergeI18n(map, { [primary]: plain ?? "" });
}
