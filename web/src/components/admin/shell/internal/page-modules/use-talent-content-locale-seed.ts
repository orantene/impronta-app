"use client";

/**
 * Seeds the active content locale store (which tab every translatable input
 * opens on) for a talent dashboard: the `locale` cookie when it is one of the
 * talent's languages, else the talent's primary. Mounted once from the top
 * bar's LanguageMenu, which is on every talent page.
 */
import { useEffect } from "react";

import { readLocaleFromDocumentCookie } from "@/components/dashboard-locale-toggle";
import {
  publishActiveContentLocale,
  seedContentLocaleState,
} from "@/lib/i18n/active-content-locale-store";

export function useTalentContentLocaleSeed(
  talentLocales: { primary: string; secondary: readonly string[] } | null,
): void {
  const primary = talentLocales?.primary ?? "";
  const secondaryKey = talentLocales?.secondary.join(",") ?? "";
  useEffect(() => {
    if (!primary) return;
    const secondary = secondaryKey ? secondaryKey.split(",") : [];
    const cookie = readLocaleFromDocumentCookie(primary, [primary, ...secondary]);
    publishActiveContentLocale(seedContentLocaleState(cookie, { primary, secondary }));
  }, [primary, secondaryKey]);
}
