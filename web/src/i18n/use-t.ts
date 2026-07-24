"use client";
import { useMemo } from "react";

import { createTranslator } from "./messages";
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

function translatorFor(locale: string) {
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
