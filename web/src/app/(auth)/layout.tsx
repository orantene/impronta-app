import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getPublicHostContext } from "@/lib/saas";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { PublicLanguageToggle } from "@/components/public-language-toggle";
import { getRequestLocale, ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { stripLocaleFromPathname } from "@/i18n/pathnames";

/** Auth screens should not be indexed; page titles use the root template. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Resolve the brand label to render in the auth chrome.
 *
 * - On an agency/hub host, show the tenant's `public_name`. If the tenant
 *   hasn't set one yet, fall through to the platform brand so the wordmark
 *   is never a stale constant from another tenant.
 * - On app / marketing / unknown hosts, show the platform brand.
 */
async function resolveAuthBrand(): Promise<{ label: string; isTenant: boolean }> {
  const ctx = await getPublicHostContext();
  if (ctx.kind === "agency" || ctx.kind === "hub") {
    const identity = await loadPublicIdentity(ctx.tenantId).catch(() => null);
    return {
      label: identity?.public_name?.trim() || PLATFORM_BRAND.name,
      isTenant: true,
    };
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
  const localeSettings =
    ctx.kind === "agency" || ctx.kind === "hub"
      ? await loadTenantLocaleSettings(ctx.tenantId)
      : {
          defaultLocale: "en" as const,
          supportedLocales: ["en", "es"] as const,
          showLanguageSwitcher: true,
        };
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

      <AuthFooter />
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
            <>
              <span
                className="plt-display"
                style={{
                  fontWeight: 700,
                  letterSpacing: "-0.045em",
                  fontSize: "1.375rem",
                }}
              >
                tulala
              </span>
              <span
                style={{
                  color: "var(--plt-forest)",
                  fontSize: "1.375rem",
                  fontWeight: 700,
                }}
              >
                .
              </span>
            </>
          )}
        </Link>
      </div>
    </header>
  );
}

function AuthFooter() {
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
          © {new Date().getFullYear()} Tulala. The talent business platform.
        </p>
        <div className="flex items-center gap-5 text-[0.75rem]">
          <Link
            href="/legal/terms"
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Terms
          </Link>
          <Link
            href="/legal/privacy"
            className="transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            Privacy
          </Link>
          <Link
            href="/contact"
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
