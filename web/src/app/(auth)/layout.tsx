import Link from "next/link";
import type { Metadata } from "next";
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
 * Resolve the brand label to render above the auth card.
 *
 * - On an agency/hub host, show the tenant's `public_name`. If the tenant
 *   hasn't set one yet, fall through to the platform brand so the wordmark
 *   is never a stale constant from another tenant.
 * - On app / marketing / unknown hosts, show the platform brand.
 *
 * This fixes the earlier behaviour where the layout hard-coded "IMPRONTA"
 * across every host, creating a brand conflict on the platform workspace.
 */
async function resolveAuthBrand(): Promise<string> {
  const ctx = await getPublicHostContext();
  if (ctx.kind === "agency" || ctx.kind === "hub") {
    const identity = await loadPublicIdentity(ctx.tenantId).catch(() => null);
    return identity?.public_name?.trim() || PLATFORM_BRAND.name;
  }
  return PLATFORM_BRAND.name;
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [brandLabel, locale, ctx, h] = await Promise.all([
    resolveAuthBrand(),
    getRequestLocale(),
    getPublicHostContext(),
    headers(),
  ]);
  const localeSettings =
    ctx.kind === "agency" || ctx.kind === "hub"
      ? await loadTenantLocaleSettings(ctx.tenantId)
      : { defaultLocale: "en" as const, supportedLocales: ["en", "es"] as const };
  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const { pathnameWithoutLocale } = stripLocaleFromPathname(originalPath);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link
          href="/"
          className="mb-10 font-display text-lg tracking-[0.22em] text-foreground transition-colors hover:text-primary"
        >
          {brandLabel.toUpperCase()}
        </Link>
        <div className="w-full max-w-sm rounded-lg border border-border/50 bg-card/80 p-8 shadow-none backdrop-blur-sm">
          {children}
        </div>
        <PublicLanguageToggle
          className="mt-6"
          activeLocale={locale}
          pathnameWithoutLocale={pathnameWithoutLocale}
          availableLocales={localeSettings.supportedLocales}
          defaultLocale={localeSettings.defaultLocale}
        />
      </div>
    </div>
  );
}
