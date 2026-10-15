import { createTranslator } from "@/i18n/messages";

/**
 * Translators are pure functions of their locale, so one instance per locale is
 * enough for the whole app. Caching here keeps `t` referentially stable ACROSS
 * components and renders (callers put `t` in `useCallback`/`useEffect` deps).
 *
 * Lives apart from `use-t.ts` on purpose: `use-t.ts` registers the full message
 * catalogs in the browser, so a public-page component that only needs a
 * translator for an explicit locale imports this module instead and reads the
 * small inlined subtrees (see `client-subtrees.ts`).
 */
const TRANSLATORS = new Map<string, ReturnType<typeof createTranslator>>();

/** Translator for an EXPLICIT locale (see `useT` for the dashboard-cookie one). */
export function translatorFor(locale: string) {
  let t = TRANSLATORS.get(locale);
  if (!t) {
    t = createTranslator(locale);
    TRANSLATORS.set(locale, t);
  }
  return t;
}
