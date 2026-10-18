import Link from "next/link";
import { TulalaWordmark } from "@/components/brand/tulala-logo";
import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";
import { getPublicHostContext, getPublicPathPrefix } from "@/lib/saas/scope";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { resolveNotFoundSlug } from "@/lib/site-admin/server/page-roles";
import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import { getRequestLocale, ORIGINAL_PATHNAME_HEADER, ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { notFoundLocale } from "@/lib/i18n/not-found-locale";
import { localeUrlSettings, withLocaleHref } from "@/i18n/pathnames";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { SkipToContent } from "@/components/accessibility/skip-to-content";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { notFoundCopy, notFoundUnnamedSite } from "@/lib/i18n/not-found-copy";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { isLocale } from "@/lib/site-admin/locales";
import CmsPublicPage from "@/app/(public)/p/[[...slug]]/page";

// E.2 — Branded 404 page (server component).
//
// When the request is on an agency host we render the agency's brand
// instead of generic Tulala chrome. Otherwise we render the canonical
// Tulala fallback. Both surfaces stay calm — no scary stack chrome.

export const dynamic = "force-dynamic";

type AgencyBrand = {
  name: string;
  /** false when the workspace has no name we can show; the eyebrow is then left out. */
  named: boolean;
  homeHref: string;
};

async function loadAgencyBrand(locale: string): Promise<AgencyBrand | null> {
  try {
    const ctx = await getPublicHostContext();
    if (!ctx || ctx.kind !== "agency" || !ctx.tenantId) return null;

    const supabase = createPublicSupabaseClient();
    if (!supabase) return null;

    const { data } = await supabase
      .from("agency_business_identity")
      .select("public_name")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    let name = (data as { public_name?: string | null } | null)?.public_name?.trim() || "";
    if (!name) {
      // TUL-697: a workspace with no public_name used to read "en Studio". Use the account name or wordmark.
      const emailBrand = await resolveTenantBrand(ctx.tenantId).catch(() => null);
      name = emailBrand?.accountName?.trim() || emailBrand?.wordmark?.trim() || "";
    }
    // Still unnamed: say "this site", never the literal word "Studio".
    return {
      name: name || notFoundUnnamedSite(locale),
      named: name !== "",
      homeHref: "/",
    };
  } catch {
    return null;
  }
}

/** TUL-877/1079: the 404 speaks the browser's language when nobody chose one. */
async function resolveNotFoundLocale(): Promise<string> {
  const h = await headers();
  const jar = await cookies();
  return notFoundLocale({
    locale: await getRequestLocale(),
    acceptLanguage: h.get("accept-language"),
    cookieLocale: jar.get(LOCALE_COOKIE)?.value,
    pathname: h.get(ORIGINAL_PATHNAME_HEADER),
    search: h.get(ORIGINAL_SEARCH_HEADER),
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveNotFoundLocale();
  return {
    title: { absolute: locale.startsWith("es") ? "Página no encontrada · Tulala" : "Page not found · Tulala" },
    robots: { index: false, follow: false },
  };
}

export default async function NotFound() {
  // PAGE ROLES — if this agency assigned a page the `notFound` role, render THAT
  // page (with the shell) as the 404 body. This boundary already renders with a
  // 404 status, so SEO stays correct. resolveNotFoundSlug only returns a slug
  // when a published page exists at it, so the not-found boundary can't recurse.
  const roleCtx = await getPublicHostContext();
  if (roleCtx?.kind === "agency" && roleCtx.tenantId) {
    const locale = await getRequestLocale();
    const notFoundSlug = await resolveNotFoundSlug(
      roleCtx.tenantId,
      isLocale(locale) ? locale : "en",
    );
    if (notFoundSlug) {
      // PROVIDER MOUNTED HERE ON PURPOSE — this file is the one place a
      // `(public)` PAGE is rendered from outside its own route group.
      //
      // `not-found.tsx` lives at the ROOT, so it gets the root layout and
      // nothing else. Importing `CmsPublicPage` pulls the component, NOT the
      // layout chain that normally wraps it, so every provider that
      // `(public)/layout.tsx` mounts is absent here. The CMS tree it renders
      // reaches `useDirectoryInquiryModal`, which throws — that is the
      // `/_not-found` route in the 61-occurrence production cluster
      // (2026-09-03 to 2026-09-05), thrown during SERVER RENDER.
      //
      // A component imported across a route-group boundary inherits nothing.
      // The hook consumers now degrade rather than throw, so this is no longer
      // load-bearing against a crash; it is here so the inquiry modal actually
      // WORKS on a tenant's custom 404 instead of silently doing nothing.
      return (
        <DirectoryInquiryModalProvider>
          <CmsPublicPage params={Promise.resolve({ slug: [notFoundSlug] })} />
        </DirectoryInquiryModalProvider>
      );
    }
  }

  // #3992: the locale is the browser-aware one; #3996: the name fallback needs it, so it resolves first.
  const locale = await resolveNotFoundLocale();
  const brand = await loadAgencyBrand(locale);
  const isAgency = brand !== null;
  const copy = notFoundCopy(locale, brand ? brand.name : null);
  const eyebrow = isAgency && brand?.named ? brand.name.toUpperCase() : "";
  const BRAND_INK = "#0B0B0D";
  const { heading, body } = copy;
  // Tenant 404: links keep the /w/<slug> prefix and the tenant's own locale
  // grammar; the platform 404 keeps the platform defaults.
  const pathPrefix = isAgency ? await getPublicPathPrefix() : "";
  const hostCtx = isAgency ? await getPublicHostContext() : null;
  const tenantLocales = hostCtx?.tenantId ? await loadTenantLocaleSettings(hostCtx.tenantId) : null;
  const localize = (href: string) => {
    const withPrefix = pathPrefix ? (href === "/" ? pathPrefix : `${pathPrefix}${href}`) : href;
    return tenantLocales
      ? withLocaleHref(withPrefix, locale, localeUrlSettings(tenantLocales.defaultLocale, tenantLocales.supportedLocales))
      : withLocaleHref(withPrefix, locale);
  };
  const primaryCta = { label: copy.primary.label, href: localize(copy.primary.href) };
  const secondaryCta = { label: copy.secondary.label, href: localize(copy.secondary.href) };

  const card = (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "#FAFAF7",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#ffffff",
          border: "1px solid rgba(24,24,27,0.10)",
          borderRadius: 16,
          padding: "32px 32px",
        }}
      >
        {isAgency ? (
          <p
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(11,11,13,0.6)",
              letterSpacing: 0.8,
              textTransform: "uppercase" as const,
              margin: 0,
            }}
          >
            {eyebrow}
          </p>
        ) : (
          <div style={{ color: BRAND_INK, lineHeight: 0 }}>
            <TulalaWordmark height={26} />
          </div>
        )}
        <h1
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 600,
            color: "#0B0B0D",
            letterSpacing: -0.4,
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 13.5,
            color: "rgba(11,11,13,0.60)",
            lineHeight: 1.55,
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {body}
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: 10,
            marginTop: 24,
          }}
        >
          <Link
            href={primaryCta.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              background: "#0F4F3E",
              color: "#ffffff",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {primaryCta.label}
          </Link>
          <Link
            href={secondaryCta.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              border: "1px solid rgba(24,24,27,0.12)",
              background: "transparent",
              color: "#0B0B0D",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            {secondaryCta.label}
          </Link>
        </div>

        {isAgency ? (
          <p
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 11.5,
              color: "rgba(11,11,13,0.6)",
              marginTop: 24,
              marginBottom: 0,
            }}
          >
            {copy.poweredBy}
          </p>
        ) : null}
      </div>
    </div>
  );

  // A workspace public site keeps its chrome (nav + footer) on a 404; the
  // provider is mounted here for the same reason as the role-page branch above.
  return isAgency ? (
    <DirectoryInquiryModalProvider>
      <SkipToContent locale={locale} />
      <PublicHeader />
      <main id="main-content" className="w-full flex-1">
        {card}
      </main>
      <PublicFooter />
    </DirectoryInquiryModalProvider>
  ) : card;
}
