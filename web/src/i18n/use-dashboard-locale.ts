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

export function useDashboardLocale(): string {
  const serverLocale = useContext(DashboardLocaleContext);
  const [locale, setLocale] = useState(() => initialDashboardLocale(serverLocale));
  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    if (m) setLocale(decodeURIComponent(m[1]));
  }, []);
  return locale;
}
