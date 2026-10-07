/**
 * TUL-70 round 3: ONE editing-locale state for the whole builder.
 *
 * The state lives in the active-content-locale store (`@/lib/i18n/
 * active-content-locale-store`). Three consumers must read and write it through
 * the helpers below, so they can never disagree:
 *   - the canvas (`ClientBuilderCanvas` overlay resolution + the talent label
 *     localiser in `InEditorCanvasRegion`),
 *   - the inspector field tabs (`LocaleFieldTabs`),
 *   - the top-bar ES/EN pill.
 */
import {
  buildContentFallbackChain,
  getActiveContentLocaleSnapshot,
  publishActiveContentLocale,
  type ActiveContentLocaleState,
} from "@/lib/i18n/active-content-locale-store";

/** The store state for "edit in `code`", with the fallback walk `[code, default, ...rest]`. */
export function buildEditingLocaleState(
  code: string,
  defaultLocale: string,
  supported: readonly string[],
): ActiveContentLocaleState {
  const ordered = [defaultLocale, ...supported.filter((l) => l !== defaultLocale)];
  return {
    locale: code,
    defaultLocale,
    chain: buildContentFallbackChain(code, defaultLocale, ordered),
  };
}

/** Switch the editing locale for canvas AND inspector. No-op when unchanged. */
export function selectEditingLocale(
  code: string,
  defaultLocale: string,
  supported: readonly string[],
): void {
  if (getActiveContentLocaleSnapshot().locale === code) return;
  publishActiveContentLocale(buildEditingLocaleState(code, defaultLocale, supported));
}

/**
 * Which locale the talent canvas localises its seeded labels in. The server
 * resolves swaps and live profile text for the SITE locale only, so they apply
 * only while the editing locale is the site locale. In any other locale the
 * canvas shows the stored text and lets the node's own overlay win.
 */
export function resolveCanvasLabelLocale(
  siteLocale: string,
  editingLocale: string | null | undefined,
): { locale: string; followsSite: boolean } {
  const locale = editingLocale || siteLocale;
  return { locale, followsSite: locale === siteLocale };
}

/** True when a secondary editing locale has no text of its own yet. */
export function showsMissingTranslationHint(
  activeTab: string,
  defaultLocale: string,
  hasValue: boolean,
): boolean {
  return activeTab !== defaultLocale && !hasValue;
}

/** Text compare that ignores edge whitespace, CRLF and non-breaking spaces. */
export function normalizeEditableText(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n?/g, "\n").replace(/ /g, " ").trim();
}

/** A save is only needed when the value really changed against what is stored. */
export function isTextUnchanged(
  next: string,
  ...stored: ReadonlyArray<string | null | undefined>
): boolean {
  const n = normalizeEditableText(next);
  return stored.some((s) => s != null && normalizeEditableText(s) === n);
}
