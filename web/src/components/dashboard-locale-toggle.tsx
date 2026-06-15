"use client";

import { useCallback, useEffect, useState } from "react";
import { isLocale, type Locale } from "@/i18n/config";
import { LOCALE_COOKIE, localeCookieOptions } from "@/i18n/locale-middleware";
import { cn } from "@/lib/utils";

function readLocaleFromDocumentCookie(fallback: Locale): Locale {
  if (typeof document === "undefined") return fallback;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  const raw = m?.[1] ? decodeURIComponent(m[1]) : null;
  return raw && isLocale(raw) ? raw : fallback;
}

function setLocaleCookie(locale: Locale) {
  const { path, maxAge, sameSite, secure } = localeCookieOptions;
  let line = `${LOCALE_COOKIE}=${locale}; path=${path}; max-age=${String(maxAge)}; samesite=${sameSite}`;
  if (secure) line += "; secure";
  document.cookie = line;
}

/**
 * Dashboard UI language toggle (URL stays /admin | /talent | /client).
 *
 * Config-aware: accepts the tenant's `supportedLocales` and `defaultLocale`
 * (threaded from the admin / client shell which resolves them server-side).
 * Hides entirely when `supportedLocales.length <= 1` (single-language tenant).
 * Initialises its active state from the locale cookie, falling back to the
 * tenant's `defaultLocale`.
 */
export function DashboardLocaleToggle({
  className,
  variant = "default",
  supportedLocales,
  defaultLocale = "en",
}: {
  className?: string;
  /** Matches admin prototype gold chrome (uses --admin-* tokens on an ancestor). */
  variant?: "default" | "prototype";
  /**
   * Tenant's supported locale list (from `TenantLocaleSettings.supportedLocales`).
   * When omitted or length <= 1, the toggle hides completely.
   */
  supportedLocales?: readonly Locale[];
  /**
   * Tenant's primary / default locale (from `TenantLocaleSettings.defaultLocale`).
   * Used as the initial active state when no cookie is set.
   */
  defaultLocale?: Locale;
}) {
  // Resolve the effective list: if not provided, fall back to the two-locale
  // default so the component behaves the same as before for call sites that
  // haven't been updated yet.
  const locales: readonly Locale[] =
    supportedLocales && supportedLocales.length > 0
      ? supportedLocales
      : ["en", "es"];

  const [locale, setLocale] = useState<Locale>(defaultLocale);

  useEffect(() => {
    // Seed from cookie on mount; use tenant default when cookie is absent /
    // holds a locale this tenant no longer supports.
    const fromCookie = readLocaleFromDocumentCookie(defaultLocale);
    setLocale(locales.includes(fromCookie) ? fromCookie : defaultLocale);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLocale]);

  const pick = useCallback((next: Locale) => {
    setLocaleCookie(next);
    setLocale(next);
    /* router.refresh() often leaves RSC cache stale; full reload applies cookie + layout copy. */
    window.location.reload();
  }, []);

  // Single-language tenant: hide the toggle completely.
  if (locales.length <= 1) return null;

  const isProto = variant === "prototype";

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 text-xs font-medium",
        isProto
          ? "rounded-xl border border-[var(--admin-gold-border)]/55 bg-[var(--admin-workspace-surface)]/95 px-1 py-0.5 shadow-sm backdrop-blur-sm"
          : "gap-1 rounded-md border border-border/60 bg-background/80 px-1 py-0.5",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {locales.map((code, index) => {
        const active = locale === code;
        return (
          <span key={code} className="inline-flex items-center gap-0.5">
            {index > 0 ? (
              <span
                className={cn(
                  "select-none",
                  isProto ? "text-[var(--admin-gold-border)]" : "text-border",
                )}
                aria-hidden
              >
                |
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => pick(code)}
              className={cn(
                "rounded-md px-2 py-0.5 transition-colors duration-150",
                isProto && active
                  ? "bg-[var(--admin-gold-soft)] text-[var(--admin-nav-active-label)] shadow-[inset_0_0_0_1px_var(--admin-gold-border)]"
                  : isProto
                    ? "text-[var(--admin-nav-idle)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-nav-hover-fg)]"
                    : active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
              )}
            >
              {code.toUpperCase()}
            </button>
          </span>
        );
      })}
    </div>
  );
}
