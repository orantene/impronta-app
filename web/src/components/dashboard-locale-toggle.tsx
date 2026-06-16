"use client";

import { useCallback, useEffect, useState } from "react";
import { isLocaleInList, type Locale } from "@/i18n/config";
import { LOCALE_COOKIE, localeCookieOptions } from "@/i18n/locale-middleware";
import { cn } from "@/lib/utils";

/**
 * Reads the locale cookie and accepts it only when it's in this toggle's
 * resolved `allowed` list. Using the narrow static `isLocale` (en/es) here
 * would reject any registry-added locale (e.g. `fr`), leaving the active pill
 * stuck on the fallback — so we validate against the tenant's actual supported
 * locales instead.
 */
function readLocaleFromDocumentCookie(fallback: Locale, allowed: readonly Locale[]): Locale {
  if (typeof document === "undefined") return fallback;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  const raw = m?.[1] ? decodeURIComponent(m[1]) : null;
  return raw && isLocaleInList(raw, allowed) ? raw : fallback;
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
      : (["en", "es"] as Locale[]);

  // Stable string dep so the effect only re-runs when the locale set changes.
  const localesKey = locales.join(",");

  const [locale, setLocale] = useState<Locale>(defaultLocale);

  useEffect(() => {
    // Re-derive the list from the stable key so the closure doesn't capture
    // the `locales` array reference (which may change identity on re-render).
    const list = localesKey.split(",").filter((s): s is Locale => s.length > 0);
    // Seed from cookie on mount, validating against this tenant's supported
    // list so a registry locale (e.g. `fr`) is honoured; use tenant default
    // when the cookie is absent / holds a locale this tenant no longer supports.
    const fromCookie = readLocaleFromDocumentCookie(defaultLocale, list);
    setLocale(list.includes(fromCookie) ? fromCookie : defaultLocale);
  }, [defaultLocale, localesKey]);

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
