import { withLocalePath } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { cn } from "@/lib/utils";

/**
 * EN | ES switch, marketing-themed. Plain `<a>` links (full navigation) to the
 * `/es` rewrite — `next/link` breaks under locale rewrites. Server-rendered;
 * `activeLocale` + `pathnameWithoutLocale` come from the shell.
 */
const LOCALES = ["en", "es"] as const;

export function MarketingLanguageToggle({
  activeLocale,
  pathnameWithoutLocale,
  className,
  style,
}: {
  activeLocale: string;
  pathnameWithoutLocale: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const settings = {
    ...FALLBACK_LANGUAGE_SETTINGS,
    defaultLocale: "en",
    publicLocales: ["en", "es"],
  };
  return (
    <div
      role="group"
      aria-label="Language"
      className={cn("inline-flex items-center gap-0.5 rounded-full p-0.5", className)}
      style={{
        border: "1px solid var(--plt-hairline-strong)",
        background: "var(--plt-bg-raised)",
        ...style,
      }}
    >
      {LOCALES.map((code) => {
        const active = activeLocale === code;
        return (
          <a
            key={code}
            href={withLocalePath(pathnameWithoutLocale, code, settings)}
            aria-current={active ? "true" : undefined}
            className="rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.08em] transition-colors"
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
