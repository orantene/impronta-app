import Link from "next/link";
import { headers } from "next/headers";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { TulalaLogo } from "@/components/brand/tulala-logo";
import { getRequestLocale } from "@/i18n/request-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { CurrencyPicker } from "./currency-picker";
import { MarketingLanguageToggle } from "./marketing-language-toggle";
import { resolveCurrency } from "@/lib/pricing/currency-resolver";

/** Hrefs by column. Labels come from the copy module (per locale), in order. */
const FOOTER_HREFS = {
  platform: ["/#builder", "/#messenger", "/network", "/integrations", "/how-it-works"],
  solutions: ["/operators", "/agencies", "/organizations", "/#stories"],
  discover: ["/directory", "/discover-agencies", "/#stories"],
  company: ["/pricing", "/get-started", "/faq", "/resources", "/legal/privacy", "/legal/terms"],
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
  const COLUMNS = (["platform", "solutions", "discover", "company"] as const).map((key) => ({
    label: copy.columns[key].label,
    items: copy.columns[key].items.map((label, i) => ({
      label,
      href: FOOTER_HREFS[key][i],
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
            <div className="mt-8 flex items-center gap-2.5">
              <SocialLink href="https://instagram.com" label="Instagram">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
                </svg>
              </SocialLink>
              <SocialLink href="https://x.com" label="X">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 4L20 20M20 4L4 20"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </SocialLink>
              <SocialLink href="https://linkedin.com" label="LinkedIn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M7 10V17M7 7.5V7.5M11 17V13C11 11.3 12.3 10 14 10C15.7 10 17 11.3 17 13V17"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </SocialLink>
            </div>
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
          <div className="inline-flex items-center gap-3">
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

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border transition-[transform,color,border-color] hover:-translate-y-[1px] hover:border-[var(--plt-forest)] hover:text-[var(--plt-forest)]"
      style={{
        borderColor: "var(--plt-hairline-strong)",
        color: "var(--plt-ink-soft)",
      }}
    >
      {children}
    </a>
  );
}
