"use client";
import { useMemo } from "react";

import { translatorFor } from "./translator-for";
import { usePublicT } from "./use-public-t";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";

import { registerFullCatalogs } from "@/i18n/messages";
import { withPluralization } from "./interpolate";
import { useDashboardLocale } from "./use-dashboard-locale";

// Dashboard copy is read through `useT`; importing this module registers the FULL catalogs in
// the browser build, where `@/i18n/messages` otherwise holds only the client subtrees (see
// `client-subtrees.ts`). Public pages use `usePublicT` and never import this file.
registerFullCatalogs({
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
  fr: fr as Record<string, unknown>,
});

/** Same hook as `usePublicT`; the difference is only this module's catalog import. */
export const useT = usePublicT;

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
