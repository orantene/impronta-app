import { headers } from "next/headers";
import { getRequestLocale } from "@/i18n/request-locale";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { MarketingHeader } from "./header";
import { MarketingFooter } from "./footer";
import { MarketingModalHost } from "./marketing-modal-host";

/**
 * The outer layout for every platform marketing surface (homepage + sub-pages).
 *
 * Wraps content in `data-platform-surface="marketing"` so the Rostra platform
 * design tokens and typography (see globals.css) apply inside this subtree
 * only — never leaking into tenant storefronts or workspace chrome.
 *
 * Resolves the active locale + clean path once and hands them to the header so
 * the nav, CTAs, and the EN|ES toggle render in the right language.
 */
export async function MarketingShell({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const h = await headers();
  const originalPath = h.get("x-impronta-original-pathname") ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    originalPath,
    FALLBACK_LANGUAGE_SETTINGS,
  );

  return (
    <div
      data-platform-surface="marketing"
      className="flex min-h-screen flex-col"
      style={{ background: "var(--plt-bg)", color: "var(--plt-ink)" }}
    >
      <MarketingHeader locale={locale} pathnameWithoutLocale={pathnameWithoutLocale} />
      <main className="flex-1 pt-[var(--plt-header-h,64px)] sm:pt-[72px]">{children}</main>
      <MarketingFooter />
      <MarketingModalHost />
    </div>
  );
}
