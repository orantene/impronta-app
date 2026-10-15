"use client";
import { useMemo } from "react";

import { translatorFor } from "./translator-for";
// Dashboard copy is read through `useT`; this registers the full catalogs in
// the browser build, where `@/i18n/messages` otherwise holds only the
// client subtrees (see `client-subtrees.ts`).
import "./full-catalogs.client";
import { withPluralization } from "./interpolate";
import { useDashboardLocale } from "./use-dashboard-locale";

export { translatorFor };

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
