import Link from "next/link";
import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";
import { getPublicHostContext, getPublicPathPrefix } from "@/lib/saas/scope";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { resolveNotFoundSlug } from "@/lib/site-admin/server/page-roles";
import { getRequestLocale } from "@/i18n/request-locale";
import { localeUrlSettings, withLocaleHref } from "@/i18n/pathnames";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { SkipToContent } from "@/components/accessibility/skip-to-content";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { notFoundCopy } from "@/lib/i18n/not-found-copy";
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
  homeHref: string;
};

async function loadAgencyBrand(): Promise<AgencyBrand | null> {
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

    const name = (data as { public_name?: string | null } | null)?.public_name?.trim();
    return {
      name: name && name.length > 0 ? name : "Studio",
      homeHref: "/",
    };
  } catch {
    return null;
  }
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

  const brand = await loadAgencyBrand();
  const isAgency = brand !== null;
  const locale = await getRequestLocale();
  const copy = notFoundCopy(locale, brand ? brand.name : null);
  const eyebrow = isAgency && brand ? brand.name.toUpperCase() : "TULALA";
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
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(11,11,13,0.38)",
            letterSpacing: 0.8,
            textTransform: "uppercase" as const,
            margin: 0,
          }}
        >
          {eyebrow}
        </p>
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
              color: "rgba(11,11,13,0.42)",
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
