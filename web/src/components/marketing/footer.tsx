import Link from "next/link";
import { headers } from "next/headers";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { TulalaLogo } from "@/components/brand/tulala-logo";
import { getRequestLocale } from "@/i18n/request-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { stripLocaleFromPathname, withLocaleHref } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { CurrencyPicker } from "./currency-picker";
import { MarketingLanguageToggle } from "./marketing-language-toggle";
import { resolveCurrency } from "@/lib/pricing/currency-resolver";

/** Hrefs by column. Labels come from the copy module (per locale), in order. */
const FOOTER_HREFS = {
  platform: ["/#builder", "/#messenger", "/network", "/integrations", "/how-it-works"],
  solutions: ["/operators", "/agencies", "/organizations", "/#stories"],
  discover: ["/directory", "/discover-agencies", "/#stories"],
  company: [
    "/about",
    "/pricing",
    "/get-started",
    "/faq",
    "/resources",
    "/legal/privacy",
    "/legal/terms",
  ],
};

export async function MarketingFooter() {
  // L50 Phase 2: every marketing footer ends with a currency picker so
  // any page is the gateway to changing the displayed currency. The
  // footer doesn't know which page it's on, so it resolves from cookie
  // + IP only (no URL param).
  const { currency, source } = await resolveCurrency(null);
  const locale = await getRequestLocale();
  const copy = getMarketingCopy(locale).footer;
  const brand = getMarketingCopy(locale).brand;
  const h = await headers();
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    h.get("x-impronta-original-pathname") ?? "/",
    FALLBACK_LANGUAGE_SETTINGS,
  );
  // Same rule as the header: hrefs are authored unprefixed and localized at
  // render, so a Spanish reader stays in the Spanish tree and crawlers see
  // /es linking to /es rather than funnelling all authority to English.
  const COLUMNS = (["platform", "solutions", "discover", "company"] as const).map((key) => ({
    label: copy.columns[key].label,
    items: copy.columns[key].items.map((label, i) => ({
      label,
      href: withLocaleHref(FOOTER_HREFS[key][i], locale),
    })),
  }));
  return (
    <footer
      className="relative"
      style={{
        borderTop: "1px solid var(--plt-hairline)",
        background: "var(--plt-bg-deep)",
        color: "var(--plt-ink)",
      }}
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 md:grid-cols-[1.25fr_repeat(4,_1fr)] md:gap-10">
          <div className="max-w-xs">
            <div className="flex items-center" style={{ color: "var(--plt-ink-strong)" }}>
              <TulalaLogo wordmarkHeight={24} />
            </div>
            <p
              className="mt-2 text-[0.625rem] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--plt-muted)" }}
            >
              {brand.descriptor}
            </p>
            <p
              className="mt-5 text-[0.9375rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {copy.description}
            </p>
            {/* Social icon row removed 2026-07-23 (Wave 1, item 1.5): the
                links pointed at bare instagram.com / x.com / linkedin.com
                homepages, not real Tulala profiles, which reads as a fake
                CTA. Re-add this block (and its <SocialLink> helper, see
                git history on this file) once real handles exist and are
                wired into `sameAs` / `twitter:site`. */}
          </div>

          {COLUMNS.map((col) => (
            <div key={col.label}>
              <h4
                className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.22em]"
                style={{ color: "var(--plt-muted-soft)" }}
              >
                {col.label}
              </h4>
              <ul className="mt-5 space-y-3">
                {col.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-block text-[0.9375rem] transition-colors hover:text-[var(--plt-forest)]"
                      style={{ color: "var(--plt-ink-soft)" }}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-16 flex flex-col items-start justify-between gap-4 border-t pt-6 text-[0.8125rem] sm:flex-row sm:items-center"
          style={{ borderColor: "var(--plt-hairline)", color: "var(--plt-muted)" }}
        >
          <span>
            &copy; {new Date().getFullYear()} {PLATFORM_BRAND.legalName}. {PLATFORM_BRAND.positioning}
          </span>
          {/* MUST wrap: language pill + currency picker + stage tag run
              359px wide — an inline-flex here overflowed every mobile page
              by 3px and made the whole site wobble sideways (the "broken
              scrolling" report of 2026-07-23). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <MarketingLanguageToggle
              activeLocale={locale}
              pathnameWithoutLocale={pathnameWithoutLocale}
            />
            <CurrencyPicker current={currency} source={source} />
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--plt-forest-bright)" }}
                aria-hidden
              />
              {PLATFORM_BRAND.stage}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
