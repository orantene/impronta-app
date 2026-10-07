/**
 * List-level "missing translation" cue for a service row.
 *
 * Pure. Reuses `localeStatus` (the same rule the per-field dot in the editor
 * uses) so the list and the editor never disagree about what "missing" means.
 *
 * Rules:
 *   - Only when the talent has exactly two languages enabled. One language has
 *     nothing to translate; three or more is a different, larger conversation.
 *   - Returns the language code that has no title while the other has one.
 *   - An item with no title in either language is just "untitled" and already
 *     has its own cue, so it returns null here.
 */
import { localeStatus } from "@/lib/i18n/locale-field-model";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";

export function missingTitleLocale(
  item: { title: string; titleI18n?: LocalizedMap | null },
  primary: string,
  locales: readonly string[],
): string | null {
  if (locales.length !== 2 || !locales.includes(primary)) return null;
  // The plain `title` always mirrors the primary language (see OfferingNameField).
  const map: LocalizedMap = { ...(item.titleI18n ?? {}), [primary]: item.title };
  const missing = locales.filter((code) => localeStatus(map, code) === "missing");
  return missing.length === 1 ? missing[0] : null;
}
