"use client";

import { useLayoutEffect } from "react";

import { dashboardDocumentLang } from "@/i18n/dashboard-document-lang";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

/**
 * Keeps `<html lang>` equal to the DASHBOARD language on /talent/* and the
 * workspace admin. The root layout derives `lang` from the request locale
 * (header, path, cookie), which can still say "en" while the dashboard body
 * renders Spanish (first visit before the cookie is seeded, or a client-side
 * language switch), so Chrome offered "Translate from English" on Spanish
 * pages. Renders nothing; restores the previous value on unmount.
 */
export function DashboardDocumentLang() {
  const locale = useDashboardLocale();
  useLayoutEffect(() => {
    const lang = dashboardDocumentLang(locale);
    if (!lang) return undefined;
    const prev = document.documentElement.lang;
    if (prev !== lang) document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = prev;
    };
  }, [locale]);
  return null;
}
