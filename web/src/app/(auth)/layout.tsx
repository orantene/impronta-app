import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getSiteUrl } from "@/lib/auth-flow";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { TulalaLogo } from "@/components/brand/tulala-logo";
import { getPublicHostContext } from "@/lib/saas";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadTenantWhitelabel } from "@/lib/brand/tenant-whitelabel";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { PublicLanguageToggle } from "@/components/public-language-toggle";
import { getRequestLocale, ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { stripLocaleFromPathname } from "@/i18n/pathnames";

/** Auth screens should not be indexed; page titles use the root template. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Resolve the brand label to render in the auth chrome.
 *
 * Registration and sign-in are Tulala-platform surfaces by default — everyone
 * signs into the same platform. The tenant's own brand only takes over when the
 * agency is on a whitelabel tier (Agency / Network): then a talent or client
 * signing in on that agency's host sees the agency brand, not Tulala.
 *
 * - On a WHITELABEL agency/hub host, show the tenant's `public_name` (falling
 *   back to the platform brand if it hasn't been set yet, so the wordmark is
 *   never a stale constant from another tenant).
 * - On a non-whitelabel agency/hub host, and on app / marketing / unknown
 *   hosts, show the platform brand (Tulala).
 */
async function resolveAuthBrand(): Promise<{ label: string; isTenant: boolean }> {
  const ctx = await getPublicHostContext();
  if (ctx.kind === "agency" || ctx.kind === "hub") {
    const [identity, whitelabel] = await Promise.all([
      loadPublicIdentity(ctx.tenantId).catch(() => null),
      loadTenantWhitelabel(ctx.tenantId).catch(() => false),
    ]);
    if (whitelabel) {
      return {
        label: identity?.public_name?.trim() || PLATFORM_BRAND.name,
        isTenant: true,
      };
    }
  }
  return { label: PLATFORM_BRAND.name, isTenant: false };
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [brand, locale, ctx, h] = await Promise.all([
    resolveAuthBrand(),
    getRequestLocale(),
    getPublicHostContext(),
    headers(),
  ]);
  // For agency/hub hosts: use the tenant's locale settings.
  // For platform/marketing hosts: `loadTenantLocaleSettings("")` returns the
  // platform fallback (single "en", switcher hidden) — the auth layout still
  // renders a toggle via `PublicLanguageToggle` which hides itself when
  // `supportedLocales.length <= 1`, so no toggle shows on the platform host.
  const localeSettings =
    ctx.kind === "agency" || ctx.kind === "hub"
      ? await loadTenantLocaleSettings(ctx.tenantId)
      : await loadTenantLocaleSettings("");
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath);

  return (
    <div
      className="site-theme-platform flex min-h-full flex-1 flex-col"
      data-platform-surface="marketing"
      style={{ background: "var(--plt-bg)" }}
    >
      <AuthTopBar brandLabel={brand.label} isTenant={brand.isTenant} />

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-12 sm:py-16">
        <div className="w-full max-w-[440px]">{children}</div>
        <PublicLanguageToggle
          className="mt-6"
          activeLocale={locale}
          pathnameWithoutLocale={pathnameWithoutLocale}
          availableLocales={localeSettings.supportedLocales}
          defaultLocale={localeSettings.defaultLocale}
          showLanguageSwitcher={localeSettings.showLanguageSwitcher}
        />
      </main>

      <AuthFooter
        brandLabel={brand.label}
        isTenant={brand.isTenant}
        legalLine={getMarketingCopy(locale).footer.legalLine}
      />
    </div>
  );
}

function AuthTopBar({
  brandLabel,
  isTenant,
}: {
  brandLabel: string;
  isTenant: boolean;
}) {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-xl"
      style={{
        background:
          "color-mix(in srgb, var(--plt-bg) 88%, transparent)",
        borderBottom: "1px solid var(--plt-hairline)",
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:h-[72px] sm:px-8">
        <Link
          href="/"
          aria-label={`${brandLabel} — home`}
          className="inline-flex items-baseline leading-none"
          style={{ color: "var(--plt-ink)" }}
        >
          {isTenant ? (
            <span
              className="plt-display text-[0.9rem] font-medium uppercase tracking-[0.22em]"
              style={{ color: "var(--plt-ink)" }}
            >
              {brandLabel}
            </span>
          ) : (
            <span style={{ color: "var(--plt-ink-strong)" }}>
              <TulalaLogo wordmarkHeight={23} />
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

function AuthFooter({
  brandLabel,
  isTenant,
  legalLine,
}: {
  brandLabel: string;
  isTenant: boolean;
  /** Localized positioning line — PLATFORM_BRAND.positioning is English-only. */
  legalLine: string;
}) {
  // On a whitelabel agency host the footer carries the agency's name; otherwise
  // it stays the Tulala platform line.
  const footerLine = isTenant
    ? `© ${new Date().getFullYear()} ${brandLabel}.`
    : // Same copyright line as the marketing footer's bottom rail: legal name +
      // positioning. The category message lives in the logo lockup only.
      `© ${new Date().getFullYear()} ${PLATFORM_BRAND.legalName}. ${legalLine}`;
  return (
    <footer
      className="py-8"
      style={{
        borderTop: "1px solid var(--plt-hairline)",
        background: "var(--plt-bg)",
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-5 sm:flex-row sm:px-8">
        <p
          className="text-[0.75rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {footerLine}
        </p>
        <div className="flex items-center gap-5 text-[0.75rem]">
          <Link
            href={`${getSiteUrl()}/legal/terms`}
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Terms
          </Link>
          <Link
            href={`${getSiteUrl()}/legal/privacy`}
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Privacy
          </Link>
          <Link
            href={`${getSiteUrl()}/contact`}
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
