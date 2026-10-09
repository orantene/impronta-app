"use client";

import { useEffect, useMemo, useState } from "react";

import {
  readLocaleCookie,
  useServerDashboardLocale,
} from "@/i18n/use-dashboard-locale";
import {
  detectEditorLocale,
  editorT,
  type EditorLocale,
} from "./editor-i18n";

/**
 * One source of truth for editor chrome (TUL-459 / TUL-303 parity):
 * inside `DashboardLocaleProvider` the SERVER request locale wins and the
 * cookie is never re-read on the client. F88 seeded the first paint from the
 * provider but left a mount effect that overwrote from `locale` cookie — so
 * Publish drawer chrome ("Publish page", "Checks", …) flipped EN↔ES across
 * renders when the cookie disagreed (cleared at sign-in, auto-default en).
 * Outside a provider the cookie (then browser detect) remains the source.
 */
export function resolveEditorLocale(
  serverLocale: string | null | undefined,
  cookieLocale: string | null | undefined,
  fallback: EditorLocale = "en",
): EditorLocale {
  if (serverLocale === "es" || serverLocale === "en") return serverLocale;
  if (cookieLocale === "es" || cookieLocale === "en") return cookieLocale;
  return fallback;
}

/**
 * Editor chrome locale — separate from page content locale (see
 * active-content-locale-bridge.ts for the latter).
 */
export function useEditorLocale(): {
  locale: EditorLocale;
  t: typeof editorT;
} {
  const serverLocale = useServerDashboardLocale();
  const hasServerLocale = serverLocale === "es" || serverLocale === "en";
  const [cookieLocale, setCookieLocale] = useState<EditorLocale | null>(null);

  useEffect(() => {
    if (hasServerLocale) return;
    const v = readLocaleCookie();
    if (v === "es" || v === "en") setCookieLocale(v);
  }, [hasServerLocale]);

  // Outside a provider, seed synchronously from the browser so the first
  // client paint is not stuck on English before the cookie effect runs.
  const locale = resolveEditorLocale(
    serverLocale,
    cookieLocale,
    detectEditorLocale(),
  );

  return useMemo(
    () => ({
      locale,
      t: (key: Parameters<typeof editorT>[0]) => editorT(key, locale),
    }),
    [locale],
  );
}
