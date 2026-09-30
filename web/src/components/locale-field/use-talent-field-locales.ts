"use client";

/**
 * The talent's languages for a translatable field, read from the active
 * content locale store (seeded from `useAdminShell().talentLocales` by the
 * talent top bar, and by the talent page-builder mount): `primary` plus every
 * language, primary first.
 *
 * Until the store is seeded it reports ONE language, so fields render as plain
 * inputs (no badge, no AI) rather than guessing. `localesFor(primary)` is for
 * callers that learn the primary from the server: it returns the talent's
 * languages only when the store was seeded for that same primary.
 */
import { useMemo } from "react";

import {
  getActiveContentLocaleServerSnapshot,
  useActiveContentLocale,
} from "@/lib/i18n/active-content-locale-store";
import { orderLocales } from "@/lib/i18n/locale-field-model";

export function useTalentFieldLocales(): {
  primary: string;
  locales: string[];
  active: string;
  seeded: boolean;
  localesFor: (primary: string) => string[];
} {
  const state = useActiveContentLocale();
  const seeded = state !== getActiveContentLocaleServerSnapshot();
  const { locale, defaultLocale, chain } = state;
  const key = chain.join(",");
  return useMemo(() => {
    const locales = seeded ? orderLocales(defaultLocale, key.split(",").filter(Boolean)) : [defaultLocale];
    return {
      primary: defaultLocale,
      locales,
      active: locale,
      seeded,
      localesFor: (primary: string) => (seeded && primary === defaultLocale ? locales : [primary]),
    };
  }, [defaultLocale, key, locale, seeded]);
}
