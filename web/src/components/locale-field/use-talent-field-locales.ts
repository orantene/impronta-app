"use client";

/**
 * The talent's languages for a translatable field, read from the active
 * content locale store (seeded by the dashboard top bar, and by the page
 * builder mount): `primary` plus every language, primary first.
 *
 * Before the store is seeded this reports its neutral default (one language),
 * so fields render as plain inputs rather than guessing.
 */
import { useMemo } from "react";

import { useActiveContentLocale } from "@/lib/i18n/active-content-locale-store";
import { orderLocales } from "@/lib/i18n/locale-field-model";

export function useTalentFieldLocales(): { primary: string; locales: string[]; active: string } {
  const { locale, defaultLocale, chain } = useActiveContentLocale();
  const key = chain.join(",");
  return useMemo(
    () => ({
      primary: defaultLocale,
      locales: orderLocales(defaultLocale, key.split(",").filter(Boolean)),
      active: locale,
    }),
    [defaultLocale, key, locale],
  );
}
