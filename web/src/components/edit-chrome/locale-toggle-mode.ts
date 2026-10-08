/**
 * TUL-70: which language control the top bar shows, as a pure function.
 *
 * Freeform adapters (talent pages included) report a single-locale
 * `availableLocales` after the composition loads, so the in-place content
 * toggle vanished and the navigating `NavLocaleToggle` took over. On the talent
 * builder that navigation reloaded the page and the editor stayed Spanish. The
 * talent builder has no per-locale URL, so it always uses the in-place toggle,
 * fed by the talent's own languages (`tenantLocales`).
 */
export type LocaleToggleMode = "inplace" | "nav" | "none";

export function resolveLocaleToggleMode(input: {
  surfaceKind: string | null | undefined;
  talentBuilder: boolean;
  availableLocales: ReadonlyArray<string>;
  tenantLocales: ReadonlyArray<string>;
}): { mode: LocaleToggleMode; locales: ReadonlyArray<string> } {
  const { surfaceKind, talentBuilder, availableLocales, tenantLocales } = input;
  if (talentBuilder && tenantLocales.length > 1) {
    return { mode: "inplace", locales: tenantLocales };
  }
  if (availableLocales.length > 1 && surfaceKind !== "cms_page") {
    return { mode: "inplace", locales: availableLocales };
  }
  if (tenantLocales.length > 1) return { mode: "nav", locales: tenantLocales };
  return { mode: "none", locales: availableLocales };
}
