"use client";

/**
 * EN | ES toggle for the auth footer.
 *
 * Why not `PublicLanguageToggle`: that component is styled with shadcn
 * semantics (`border-border`, `bg-background`, `text-muted-foreground`) which
 * are wrong on a `site-theme-platform` surface, and it is shared with the
 * storefront header/shell — restyling it there is out of scope. The href logic
 * (real server paths + plain `<a>` so each switch is a full navigation, because
 * `usePathname()` reports `/` under the `/es` rewrite) is deliberately
 * identical, including the preserved query string, so a locale switch never
 * drops `?next=` / `?invitation=`.
 */

import { useSearchParams } from "next/navigation";

import { getLocaleMetadata, type Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";

export function AuthLanguageToggle({
  activeLocale,
  pathnameWithoutLocale,
  availableLocales = ["en", "es"] as const,
  defaultLocale = "en",
  showLanguageSwitcher = true,
  label,
}: {
  activeLocale: Locale;
  pathnameWithoutLocale: string;
  availableLocales?: readonly Locale[];
  defaultLocale?: Locale;
  showLanguageSwitcher?: boolean;
  /** Localized accessible group name. */
  label: string;
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
      className="inline-flex items-center gap-0.5 rounded-full p-0.5"
      style={{ border: "1px solid var(--plt-hairline-strong)" }}
      role="group"
      aria-label={label}
    >
      {locales.map((code) => {
        const active = activeLocale === code;
        const meta = getLocaleMetadata(code);
        return (
          <a
            key={code}
            href={`${withLocalePath(pathnameWithoutLocale, code, pathSettings)}${suffix}`}
            className="rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] no-underline transition-colors"
            style={
              active
                ? { background: "var(--plt-forest)", color: "var(--plt-forest-on)" }
                : { color: "var(--plt-muted)" }
            }
            aria-current={active ? "true" : undefined}
            aria-label={meta.label}
          >
            {code.toUpperCase()}
          </a>
        );
      })}
    </div>
  );
}
