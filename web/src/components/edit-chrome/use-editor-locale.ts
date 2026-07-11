"use client";

import { useEffect, useMemo, useState } from "react";

import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import {
  detectEditorLocale,
  editorT,
  type EditorLocale,
} from "./editor-i18n";

/**
 * Editor chrome locale — separate from page content locale (see
 * active-content-locale-bridge.ts for the latter).
 *
 * Seeded from `navigator.language` (available synchronously on first client
 * render) then upgraded to the app's `locale` cookie — the same cookie the
 * dashboard chrome reads via `useDashboardLocale` — once mounted, so the
 * editor's chrome language matches whatever the operator picked for the rest
 * of the app rather than drifting from the browser's Accept-Language.
 */
export function useEditorLocale(): {
  locale: EditorLocale;
  t: typeof editorT;
} {
  const [locale, setLocale] = useState<EditorLocale>(() => detectEditorLocale());

  useEffect(() => {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`),
    );
    if (!match) return;
    const cookieLocale = decodeURIComponent(match[1] ?? "");
    if (cookieLocale === "es" || cookieLocale === "en") {
      setLocale(cookieLocale);
    }
  }, []);

  return useMemo(
    () => ({
      locale,
      t: (key: Parameters<typeof editorT>[0]) => editorT(key, locale),
    }),
    [locale],
  );
}
