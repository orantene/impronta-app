import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { AgencyHomeStorefront } from "@/components/home/agency-home-storefront";
import { AppLanding } from "@/components/home/app-landing";
import { HubLanding } from "@/components/home/hub-landing";
import { MarketingLanding } from "@/components/home/marketing-landing";
import { getPublicHostContext } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveAuthenticatedDestination } from "@/lib/auth-flow";
import { createTranslator } from "@/i18n/messages";
import {
  getRequestLocale,
  ORIGINAL_PATHNAME_HEADER,
} from "@/i18n/request-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildPublicLocaleAlternates } from "@/lib/seo/locale-alternates";
import { loadPublicHomepage } from "@/lib/site-admin/server/homepage-reads";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { resolveAgencyHomeSlug } from "@/lib/site-admin/server/page-roles";
import { isLocale } from "@/lib/site-admin/locales";
import CmsPublicPage, {
  generateMetadata as cmsPageMetadata,
} from "@/app/(public)/p/[[...slug]]/page";

/** Server reads cookies (Supabase / host-context header); must not be statically prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const ctx = await getPublicHostContext();

  // PAGE ROLES — when this agency assigned a page the `home` role, `/` renders
  // that page (see the agency case below), so its SEO must come from the
  // assigned page too. Reuse the storefront page's own metadata builder, then
  // re-root the canonical/alternates to `/` (the page is served at the root,
  // not at `/p/<slug>`).
  if (ctx.kind === "agency") {
    const homeLocale = isLocale(locale) ? locale : "en";
    const homeSlug = await resolveAgencyHomeSlug(ctx.tenantId, homeLocale);
    if (homeSlug) {
      const pageMeta = await cmsPageMetadata({
        params: Promise.resolve({ slug: [homeSlug] }),
      });
      const rootAlt = buildPublicLocaleAlternates(locale, "/");
      return {
        ...pageMeta,
        metadataBase: rootAlt.metadataBase,
        alternates: rootAlt.alternates,
      };
    }
  }

  if (ctx.kind === "agency" || ctx.kind === "hub") {
    // Phase 5 / M5: CMS-driven meta overrides the i18n defaults when the
    // operator has published the homepage. Snapshot is read through a
    // cached, tag-invalidated RPC — no extra DB hit on cache hits.
    //
    // Phase 5/6 M1: hub goes through this same code path because hub is
    // a first-class tenant on the org abstraction (kind='hub' agency,
    // seeded in 20260625100000). The only kind branch is render-time
    // dispatch below; data access is unified.
    const cmsLocale = isLocale(locale) ? locale : undefined;
    const [homepage, identity] = await Promise.all([
      cmsLocale ? loadPublicHomepage(ctx.tenantId, cmsLocale) : Promise.resolve(null),
      loadPublicIdentity(ctx.tenantId),
    ]);
    const brandName = identity?.public_name?.trim() || PLATFORM_BRAND.name;
    const fallbackTitle =
      ctx.kind === "hub"
        ? `Agencies on the platform · ${brandName}`
        : identity?.seo_default_title?.trim() ||
          (identity?.public_name?.trim()
            ? `${identity.public_name.trim()} — ${identity.tagline?.trim() || t("public.meta.homeTitle")}`
            : t("public.meta.homeTitle"));
    const fallbackDescription =
      identity?.seo_default_description?.trim() || t("public.meta.homeDescription");
    const title = homepage?.metaTitle || homepage?.title || fallbackTitle;
    const description = homepage?.metaDescription || fallbackDescription;
    const ogImage = homepage?.ogImageUrl ?? undefined;
    const localeAlternates = buildPublicLocaleAlternates(locale, "/");
    return {
      title,
      description,
      robots: homepage?.noindex ? { index: false, follow: false } : undefined,
      openGraph: {
        title: homepage?.ogTitle || title,
        description: homepage?.ogDescription || description,
        images: ogImage ? [{ url: ogImage }] : undefined,
      },
      ...localeAlternates,
      alternates: {
        ...localeAlternates.alternates,
        ...(homepage?.canonicalUrl
          ? { canonical: homepage.canonicalUrl }
          : {}),
      },
    };
  }

  if (ctx.kind === "marketing") {
    const title = `${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.tagline}`;
    return {
      title,
      description: PLATFORM_BRAND.description,
      openGraph: {
        title,
        description: PLATFORM_BRAND.description,
        siteName: PLATFORM_BRAND.name,
        url: `https://${PLATFORM_BRAND.domain}/`,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: PLATFORM_BRAND.description,
      },
    };
  }

  // app / unknown — internal workspace host, no SEO surface.
  return {
    title: `${PLATFORM_BRAND.name} Workspace`,
    robots: { index: false, follow: false },
  };
}

export default async function HomePage() {
  // Dev-only convenience: when hitting localhost root, optionally jump to a
  // working surface so a preview tab doesn't land on the marketing landing.
  // Target is env-driven (no tenant hardcoded); unset = no redirect.
  // Production unaffected.
  const devRootRedirect = process.env.DEV_ROOT_REDIRECT?.trim();
  if (process.env.NODE_ENV === "development" && devRootRedirect) {
    const h = await headers();
    const host = h.get("host") ?? "";
    const originalPathname = h.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
    if (
      originalPathname === "/" &&
      (host.startsWith("localhost") || host.startsWith("127.0.0.1"))
    ) {
      redirect(devRootRedirect);
    }
  }

  const ctx = await getPublicHostContext();

  switch (ctx.kind) {
    case "agency": {
      // PAGE ROLES — if the tenant assigned a page the `home` role, serve THAT
      // page at `/` (reusing the full storefront page renderer, so an assigned
      // home is a normal page with the complete builder). resolveAgencyHomeSlug
      // returns null unless a published page exists at the slug for this locale,
      // so a dangling pointer falls back to the legacy storefront below.
      const homeLocale = await getRequestLocale();
      const homeSlug = await resolveAgencyHomeSlug(
        ctx.tenantId,
        isLocale(homeLocale) ? homeLocale : "en",
      );
      if (homeSlug) {
        return <CmsPublicPage params={Promise.resolve({ slug: [homeSlug] })} />;
      }
      return <AgencyHomeStorefront tenantId={ctx.tenantId} />;
    }
    case "hub":
      // Phase 5/6 M1 — hub now carries its tenantId (the hub agency UUID)
      // so it consumes the same CMS reads as agency tenants.
      return <HubLanding tenantId={ctx.tenantId} />;
    case "marketing":
      return <MarketingLanding />;
    case "talent_site":
      // A talent custom-domain host is ALWAYS rewritten to /_talent-site by the
      // proxy, so this case is unreachable in practice. If it is ever hit (a
      // mid-deploy header skew), 404 rather than leak the app landing — the
      // talent site has its own dedicated host route. notFound() throws, so it
      // never falls through to the app branch.
      notFound();
    case "app":
    default: {
      // App-host ROOT only: a signed-in visitor jumps straight to their
      // dashboard (admin / client / talent — whichever their role resolves
      // to); a signed-out visitor gets the welcome / sign-in gateway below.
      // Every OTHER app route auth-gates itself in middleware, so this
      // redirect is scoped to "/" — deep links into the app are untouched.
      const actor = await getCachedActorSession();
      if (actor.user) {
        const dest = resolveAuthenticatedDestination(actor.profile);
        if (dest && dest !== "/") redirect(dest);
      }
      // `unknown` only happens outside a real request (build / tests) — the
      // landing has no tenant reads and is safe.
      return <AppLanding />;
    }
  }
}
