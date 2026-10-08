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
import { localeStatus, orderLocales } from "@/lib/i18n/locale-field-model";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";

export function missingTitleLocale(
  item: { title: string; titleI18n?: LocalizedMap | null },
  primary: string,
  locales: readonly string[],
): string | null {
  if (locales.length !== 2 || !locales.includes(primary)) return null;
  // The plain `title` always mirrors the primary language (see OfferingNameField).
  const i18n = item.titleI18n ?? {};
  const map: LocalizedMap = { ...i18n, [primary]: item.title };
  // Real data: an item written in the other language (title_i18n has only that
  // language, the plain title is the same words) has NO primary-language title
  // yet; the mirrored plain title would hide it. Same words under another
  // language's key, and none stored under the primary key, means primary is missing.
  const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  if (norm(i18n[primary]) === "" && norm(item.title) !== "") {
    const other = locales.find((code) => code !== primary);
    if (other && norm(i18n[other]) === norm(item.title)) map[primary] = "";
  }
  const missing = locales.filter((code) => localeStatus(map, code) === "missing");
  return missing.length === 1 ? missing[0] : null;
}

/**
 * The languages the list judges against. The server-provided talent settings
 * (the talent layout's bridge data) win: they are present on first paint, so
 * the cue never waits on the client content-locale store, which is only seeded
 * by the top-bar language menu and reports ONE language until then. Without
 * server settings (a workspace admin surface) the store snapshot is used.
 */
export function listLocales(
  server: { primary: string; secondary: readonly string[] } | null | undefined,
  store: { primary: string; locales: string[] },
): { primary: string; locales: string[] } {
  if (server?.primary) {
    return { primary: server.primary, locales: orderLocales(server.primary, server.secondary) };
  }
  return store;
}
