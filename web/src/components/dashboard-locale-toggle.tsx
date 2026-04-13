"use client";

import { useCallback, useEffect, useState } from "react";
import { isLocale, type Locale } from "@/i18n/config";
import { LOCALE_COOKIE, localeCookieOptions } from "@/i18n/locale-middleware";
import { cn } from "@/lib/utils";

function readLocaleFromDocumentCookie(): Locale {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  const raw = m?.[1] ? decodeURIComponent(m[1]) : null;
  return isLocale(raw) ? raw : "en";
}

function setLocaleCookie(locale: Locale) {
  const { path, maxAge, sameSite, secure } = localeCookieOptions;
  let line = `${LOCALE_COOKIE}=${locale}; path=${path}; max-age=${String(maxAge)}; samesite=${sameSite}`;
  if (secure) line += "; secure";
  document.cookie = line;
}

/** Dashboard UI language only (URL stays /admin | /talent | /client). Plan §2. */
export function DashboardLocaleToggle({ className }: { className?: string }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    setLocale(readLocaleFromDocumentCookie());
  }, []);

  const pick = useCallback((next: Locale) => {
    setLocaleCookie(next);
    setLocale(next);
    /* router.refresh() often leaves RSC cache stale; full reload applies cookie + layout copy. */
    window.location.reload();
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-1 py-0.5 text-xs font-medium",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => pick("en")}
        className={cn(
          "rounded px-2 py-0.5 transition-colors",
          locale === "en"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        EN
      </button>
      <span className="text-border" aria-hidden>
        |
      </span>
      <button
        type="button"
        onClick={() => pick("es")}
        className={cn(
          "rounded px-2 py-0.5 transition-colors",
          locale === "es"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        ES
      </button>
    </div>
  );
}
