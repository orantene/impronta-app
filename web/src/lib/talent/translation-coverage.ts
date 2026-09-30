/**
 * Translation coverage for Website settings > Languages (PR 7). Pure.
 *
 * A "field" is one plain column + `_i18n` map pair that has PRIMARY text (a
 * field with nothing in the primary has nothing to translate and is not
 * counted). It is translated to `target` when the map has non-blank text there.
 */
import { toI18nMap } from "@/lib/i18n/i18n-columns";
import { countTranslated } from "@/lib/i18n/locale-field-model";

export type CoverageField = { plain: string | null | undefined; map: unknown };

export function coverage(
  fields: readonly CoverageField[],
  primary: string,
  target: string,
): { translated: number; total: number } {
  const maps = fields
    .map((f) => {
      const m = toI18nMap(f.map);
      const p = typeof f.plain === "string" ? f.plain.trim() : "";
      if (p && !m[primary]) m[primary] = p;
      return m;
    })
    .filter((m) => Boolean(m[primary]));
  return countTranslated(maps, target);
}
