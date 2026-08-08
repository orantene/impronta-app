import type { Metadata } from "next";
import { headers } from "next/headers";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getPublicHostContext } from "@/lib/saas";
import { resolveShellBrandLogoUrl } from "@/lib/site-admin/server/shell-brand-logo";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadTenantWhitelabel } from "@/lib/brand/tenant-whitelabel";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { getRequestLocale, ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { stripLocaleFromPathname } from "@/i18n/pathnames";

import { AuthLanguageToggle } from "./auth-language-toggle";
import {
  AuthBrandPanel,
  AuthFooter,
  AuthTopBar,
  type AuthShellBrand,
} from "./auth-shell-chrome";

/** Auth screens should not be indexed; page titles use the root template. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Auth Shell v2 — see `auth-shell-chrome.tsx` for the layout contract and
 * `web/docs/auth-shell-domain-architecture-2026-08-07.md` §4 for the ruling.
 *
 * Resolve the brand identity to render in the auth chrome.
 *
 * Registration and sign-in are Tulala-platform surfaces by default — everyone
 * signs into the same platform. The tenant's own brand only takes over when the
 * agency is on a whitelabel tier (Agency / Network): then a talent or client
 * signing in on that agency's host sees the agency brand, not Tulala.
 *
 * - On a WHITELABEL agency/hub host, show the tenant's `public_name` (falling
 *   back to the platform brand if it hasn't been set yet, so the wordmark is
 *   never a stale constant from another tenant), its real uploaded logo, and
 *   its own tagline.
 * - On a non-whitelabel agency/hub host, and on app / marketing / unknown
 *   hosts, show the platform brand (Tulala) with the marketing hero's proof
 *   chips.
 *
 * Every read here is `.catch(() => …)`-guarded: the brand panel is decoration,
 * and a branding read failure must never take the sign-in form down with it.
 */
async function resolveAuthBrand(
  locale: string,
  t: ReturnType<typeof createTranslator>,
): Promise<AuthShellBrand> {
  const copy = getMarketingCopy(locale);
  const ctx = await getPublicHostContext();

  if (ctx.kind === "agency" || ctx.kind === "hub") {
    const [identity, whitelabel] = await Promise.all([
      loadPublicIdentity(ctx.tenantId).catch(() => null),
      loadTenantWhitelabel(ctx.tenantId).catch(() => false),
    ]);
    if (whitelabel) {
      const label = identity?.public_name?.trim() || PLATFORM_BRAND.name;
      // Same resolver the storefront header/footer use, so the auth chrome
      // shows the tenant's REAL logo rather than a bare text wordmark. A talent
      // arrives here from a fully-branded email and storefront; a text-only
      // header read as "some other site" (owner feedback, 2026-08-06 claim-flow
      // QA). Null → letterspaced wordmark fallback.
      const logoUrl = await resolveShellBrandLogoUrl({
        tenantId: ctx.tenantId,
      }).catch(() => null);
      const tagline =
        identity?.tagline?.trim() || identity?.footer_tagline?.trim() || null;
      return {
        label,
        isTenant: true,
        logoUrl,
        tagline,
        // The agency's own tagline rides the lockup (panel eyebrow + footer);
        // the heading stays a neutral member-access line that is true for
        // talent AND clients, both of whom sign in here. Using the tagline as
        // the heading printed it twice on the panel.
        panelHeading: t("public.auth.shell.tenantHeading"),
        panelLead: t("public.auth.shell.tenantLead").replace("{brand}", label),
        // No proof chips on a tenant brand: we do not make claims on an
        // agency's behalf.
        proofChips: [],
        backLabel: t("public.auth.shell.back").replace("{site}", label),
      };
    }
  }

  return {
    label: PLATFORM_BRAND.name,
    isTenant: false,
    logoUrl: null,
    tagline: copy.brand.descriptor,
    panelHeading: copy.hero.titleLine1,
    panelLead: copy.footer.description,
    // The exact three chips the marketing hero shows, from the same copy keys.
    proofChips: copy.hero.trust,
    backLabel: t("public.auth.shell.back").replace("{site}", PLATFORM_BRAND.name),
  };
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, ctx, h] = await Promise.all([
    getRequestLocale(),
    getPublicHostContext(),
    headers(),
  ]);
  const t = createTranslator(locale);
  const brand = await resolveAuthBrand(locale, t);

  // For agency/hub hosts: use the tenant's locale settings.
  // For platform/marketing hosts: `loadTenantLocaleSettings("")` returns the
  // platform fallback (single "en", switcher hidden) — the footer still renders
  // a toggle via `AuthLanguageToggle`, which hides itself when
  // `supportedLocales.length <= 1`, so no toggle shows on the platform host.
  const localeSettings =
    ctx.kind === "agency" || ctx.kind === "hub"
      ? await loadTenantLocaleSettings(ctx.tenantId)
      : await loadTenantLocaleSettings("");
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath);

  // On a whitelabel agency host the footer carries the agency's name; otherwise
  // it stays the Tulala platform line — the same copyright rail the marketing
  // footer uses (legal name + localized positioning).
  const brandLine = brand.isTenant
    ? `© ${new Date().getFullYear()} ${brand.label}.`
    : `© ${new Date().getFullYear()} ${PLATFORM_BRAND.legalName}. ${getMarketingCopy(locale).footer.legalLine}`;

  return (
    <div
      className="site-theme-platform flex min-h-full flex-1 flex-col"
      data-platform-surface="marketing"
      style={{ background: "var(--plt-bg)" }}
    >
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,44%)_minmax(0,56%)] lg:items-start">
        <AuthBrandPanel brand={brand} />

        <div className="flex min-h-full flex-1 flex-col lg:min-h-dvh">
          <AuthTopBar brand={brand} />

          <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
            <div className="w-full max-w-[440px]">{children}</div>
          </main>

          <AuthFooter
            brand={brand}
            brandLine={brandLine}
            legal={{
              terms: t("public.auth.shell.terms"),
              privacy: t("public.auth.shell.privacy"),
              contact: t("public.auth.shell.contact"),
            }}
            languageToggle={
              <AuthLanguageToggle
                activeLocale={locale}
                pathnameWithoutLocale={pathnameWithoutLocale}
                availableLocales={localeSettings.supportedLocales}
                defaultLocale={localeSettings.defaultLocale}
                showLanguageSwitcher={localeSettings.showLanguageSwitcher}
                label={t("public.auth.language")}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
