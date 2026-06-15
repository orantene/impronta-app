"use client";

import { useSearchParams } from "next/navigation";
import { getLocaleMetadata, type Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { cn } from "@/lib/utils";

const linkClass =
  "rounded px-2 py-0.5 transition-colors no-underline inline-flex items-center";

/**
 * EN | ES — uses real paths from the server (`pathnameWithoutLocale`) and plain `<a>`
 * so each switch is a full navigation. `next/link` + `usePathname()` breaks under `/es`
 * rewrites: pathname looks like `/` while the address bar is `/es`, so Link to `/` is a no-op.
 */
export function PublicLanguageToggle({
  className,
  activeLocale,
  pathnameWithoutLocale,
  // Falls back to the static en/es list — callers already pass the
  // tenant-resolved list so this default is only reached in tests / offline.
  // The toggle hides itself when availableLocales.length <= 1.
  availableLocales = ["en", "es"] as const,
  defaultLocale = "en",
  showLanguageSwitcher = true,
}: {
  className?: string;
  activeLocale: Locale;
  pathnameWithoutLocale: string;
  availableLocales?: readonly Locale[];
  defaultLocale?: Locale;
  showLanguageSwitcher?: boolean;
}) {
  const search = useSearchParams();
  const qs = search?.toString();
  const suffix = qs ? `?${qs}` : "";
  const locales = Array.from(
    new Set([defaultLocale, ...availableLocales].filter(Boolean)),
  );
  if (!showLanguageSwitcher || locales.length <= 1) return null;

  const pathSettings = {
    ...FALLBACK_LANGUAGE_SETTINGS,
    defaultLocale,
    publicLocales: locales,
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-1 py-0.5 text-xs font-medium",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {locales.map((code, index) => {
        const active = activeLocale === code;
        const meta = getLocaleMetadata(code);
        return (
          <span key={code} className="inline-flex items-center gap-1">
            {index > 0 ? (
              <span className="text-border" aria-hidden>
                |
              </span>
            ) : null}
            <a
              href={`${withLocalePath(pathnameWithoutLocale, code, pathSettings)}${suffix}`}
              className={cn(
                linkClass,
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "true" : undefined}
              aria-label={meta.label}
            >
              {code.toUpperCase()}
            </a>
          </span>
        );
      })}
    </div>
  );
}
