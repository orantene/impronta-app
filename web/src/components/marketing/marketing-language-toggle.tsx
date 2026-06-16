import { withLocalePath } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { cn } from "@/lib/utils";

/**
 * Language switch for the marketing site, themed in the platform style.
 * Plain `<a>` links (full navigation) — `next/link` breaks under locale
 * rewrites. Server-rendered; `activeLocale` + `pathnameWithoutLocale` come
 * from the shell.
 *
 * `availableLocales` is sourced from the platform registry's `publicLocales`
 * by the parent (e.g. the marketing layout). Falls back to
 * `FALLBACK_LANGUAGE_SETTINGS.publicLocales` when not provided.
 * Hidden when `availableLocales.length <= 1` (single-language).
 */
export function MarketingLanguageToggle({
  activeLocale,
  pathnameWithoutLocale,
  className,
  style,
  availableLocales,
  defaultLocale = FALLBACK_LANGUAGE_SETTINGS.defaultLocale,
}: {
  activeLocale: string;
  pathnameWithoutLocale: string;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Platform-sourced public locale list. When omitted, falls back to
   * `FALLBACK_LANGUAGE_SETTINGS.publicLocales` (`["en","es"]`).
   */
  availableLocales?: readonly string[];
  defaultLocale?: string;
}) {
  const locales = availableLocales ?? FALLBACK_LANGUAGE_SETTINGS.publicLocales;
  if (locales.length <= 1) return null;

  const settings = {
    ...FALLBACK_LANGUAGE_SETTINGS,
    defaultLocale,
    publicLocales: Array.from(locales),
  };
  return (
    <div
      role="group"
      aria-label="Language"
      className={cn("inline-flex items-center gap-0.5 rounded-lg p-0.5", className)}
      style={{
        border: "1px solid var(--plt-hairline)",
        background: "var(--plt-bg-raised)",
        ...style,
      }}
    >
      {locales.map((code) => {
        const active = activeLocale === code;
        return (
          <a
            key={code}
            href={withLocalePath(pathnameWithoutLocale, code, settings)}
            aria-current={active ? "true" : undefined}
            className="rounded-[5px] px-1.5 py-1 text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.06em] transition-colors"
            style={{
              background: active ? "var(--plt-forest)" : "transparent",
              color: active ? "var(--plt-forest-on)" : "var(--plt-muted)",
            }}
          >
            {code}
          </a>
        );
      })}
    </div>
  );
}
