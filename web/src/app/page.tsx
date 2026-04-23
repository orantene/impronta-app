import type { Metadata } from "next";
import { AgencyHomeStorefront } from "@/components/home/agency-home-storefront";
import { AppLanding } from "@/components/home/app-landing";
import { HubLanding } from "@/components/home/hub-landing";
import { MarketingLanding } from "@/components/home/marketing-landing";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { buildPublicLocaleAlternates } from "@/lib/seo/locale-alternates";
import { loadPublicHomepage } from "@/lib/site-admin/server/homepage-reads";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { isLocale } from "@/lib/site-admin/locales";

/** Server reads cookies (Supabase / host-context header); must not be statically prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const ctx = await getPublicHostContext();

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
  const ctx = await getPublicHostContext();

  switch (ctx.kind) {
    case "agency":
      return <AgencyHomeStorefront tenantId={ctx.tenantId} />;
    case "hub":
      // Phase 5/6 M1 — hub now carries its tenantId (the hub agency UUID)
      // so it consumes the same CMS reads as agency tenants.
      return <HubLanding tenantId={ctx.tenantId} />;
    case "marketing":
      return <MarketingLanding />;
    case "app":
    default:
      // `unknown` only happens outside a real request (build / tests).
      // Render the app landing — it has no tenant reads and is safe.
      return <AppLanding />;
  }
}
