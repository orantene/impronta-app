"use client";
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { LOCALE_COOKIE } from "./locale-middleware";

/**
 * Server-resolved request locale for dashboard trees (2026-09-29).
 *
 * Without it this hook started every render at "en" and only switched to the
 * cookie in an effect, so every dashboard SERVER-RENDERED in English whatever
 * the talent's language, then flashed (or, for components that never re-read,
 * stayed) English. A layout that knows the request locale wraps its tree in
 * `DashboardLocaleProvider` so the first render already matches the cookie.
 */
const DashboardLocaleContext = createContext<string | null>(null);

export function DashboardLocaleProvider({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  return createElement(DashboardLocaleContext.Provider, { value: locale }, children);
}

/** The server-provided locale, or null outside a provider (no cookie read, no state). */
export function useServerDashboardLocale(): string | null {
  return useContext(DashboardLocaleContext);
}

/** Initial locale: the server-provided one when present, else "en". */
export function initialDashboardLocale(serverLocale: string | null | undefined): string {
  return serverLocale?.trim() ? serverLocale.trim() : "en";
}

/**
 * One source of truth (TUL-303): inside a provider the SERVER request locale
 * wins and the cookie is never re-read on the client. The proxy already folds
 * the deliberate cookie (and the seeded primary) into that server locale, and
 * the toggle writes the cookie then reloads. Re-reading the cookie after
 * hydration flipped widgets to English for a Spanish talent whose cookies were
 * cleared at sign-in, while the chrome stayed Spanish. Outside a provider the
 * cookie is still the only source.
 */
export function resolveDashboardLocale(
  serverLocale: string | null | undefined,
  cookieLocale: string | null | undefined,
): string {
  if (serverLocale?.trim()) return serverLocale.trim();
  return cookieLocale?.trim() ? cookieLocale.trim() : "en";
}

export function readLocaleCookie(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function useDashboardLocale(): string {
  const serverLocale = useContext(DashboardLocaleContext);
  const [cookieLocale, setCookieLocale] = useState<string | null>(null);
  const hasServerLocale = !!serverLocale?.trim();
  useEffect(() => {
    if (hasServerLocale) return;
    setCookieLocale(readLocaleCookie());
  }, [hasServerLocale]);
  return resolveDashboardLocale(serverLocale, cookieLocale);
}
