"use client";
import { useMemo } from "react";

import { createTranslator } from "./messages";
import { withPluralization } from "./interpolate";
import { useDashboardLocale } from "./use-dashboard-locale";

/**
 * Translators are pure functions of their locale, so one instance per locale is
 * enough for the whole app. Caching here (rather than only `useMemo`-ing per
 * component) keeps `t` referentially stable ACROSS components and renders, which
 * is what lets callers put `t` in a `useCallback`/`useEffect` dep array without
 * re-running the effect every render. Without it `createTranslator` returns a
 * fresh closure each render and any such dep array becomes an infinite loop.
 */
const TRANSLATORS = new Map<string, ReturnType<typeof createTranslator>>();

/**
 * Translator for an EXPLICIT locale.
 *
 * `useT` reads the dashboard locale from a cookie, which is correct inside the
 * workspace and wrong on any surface whose language comes from the URL. Exported
 * so those surfaces can hand their own locale down instead of inheriting a
 * cookie set on a different page.
 */
export function translatorFor(locale: string) {
  let t = TRANSLATORS.get(locale);
  if (!t) {
    t = createTranslator(locale);
    TRANSLATORS.set(locale, t);
  }
  return t;
}

export function useT() {
  const locale = useDashboardLocale();
  return useMemo(() => translatorFor(locale), [locale]);
}

/**
 * Translator for a counted noun: reads `<key>.one` / `<key>.other` and picks
 * the form by the DASHBOARD LOCALE's own plural rule, not by `count === 1`.
 * French needs the difference — it puts zero in the singular — and a card that
 * renders "0 member" or "3 miembro" is the reason this hook exists.
 */
export function useTPlural() {
  const locale = useDashboardLocale();
  return useMemo(() => withPluralization(translatorFor(locale), locale), [locale]);
}
