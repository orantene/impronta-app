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
import { pickLocale } from "@/lib/i18n/pick-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import {
  buildTenantLocaleAlternates,
  buildMarketingLocaleAlternates,
} from "@/lib/seo/locale-alternates";
import { loadPublicHomepage } from "@/lib/site-admin/server/homepage-reads";
import {
  loadPublicIdentity,
  loadPublicShareImageUrl,
} from "@/lib/site-admin/server/reads";
import { resolveAgencyHomeSlug } from "@/lib/site-admin/server/page-roles";
import { isLocale } from "@/lib/site-admin/locales";
import CmsPublicPage, {
  generateMetadata as cmsPageMetadata,
} from "@/app/(public)/p/[[...slug]]/page";
import { PublicChatSurface } from "@/app/(public)/_chat/PublicChatSurface";

/** Server reads cookies (Supabase / host-context header); must not be statically prerendered. */
export const dynamic = "force-dynamic";

/**
 * Last-resort OG image when neither the homepage nor the tenant's identity
 * exposes a share image. A static platform asset under `/public`, served on
 * whatever tenant host is rendering (resolved to absolute below). Replace with
 * a purpose-built 1200x630 PNG when one is designed (see followups).
 */
const PLATFORM_DEFAULT_OG_IMAGE_PATH = "/brand/tulala-wordmark.svg";

/**
 * Coerce an OG image reference to an ABSOLUTE URL — crawlers (WhatsApp,
 * iMessage, Instagram, X) reject relative `images`. Already-absolute URLs
 * (e.g. a Supabase `media-public` public URL) pass through unchanged; a
 * root-relative path is prefixed with the per-tenant request host so each
 * brand's card points at its own domain, falling back to the metadataBase
 * origin when the host header is absent (build / test contexts).
 */
function toAbsoluteUrl(
  value: string | null | undefined,
  hostname: string | null,
  metadataBase: string | URL | null | undefined,
): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (hostname) return `https://${hostname}${path}`;
  if (metadataBase) return new URL(path, metadataBase).toString();
  return undefined;
}

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
      const rootAlt = await buildTenantLocaleAlternates(locale, "/");
      // `pageMeta` canonicalizes to `/p/<slug>`; this page is served at `/`, so
      // its alternates are dropped and re-rooted. When the host is unresolvable
      // `rootAlt` is `{}` and they stay dropped — no canonical at all beats the
      // wrong one, and the stale `/p/<slug>` set would be exactly that.
      return { ...pageMeta, alternates: undefined, ...rootAlt };
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
    const [homepage, identity, identityShareImage] = await Promise.all([
      cmsLocale ? loadPublicHomepage(ctx.tenantId, cmsLocale) : Promise.resolve(null),
      loadPublicIdentity(ctx.tenantId),
      loadPublicShareImageUrl(ctx.tenantId),
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
    const localeAlternates = await buildTenantLocaleAlternates(locale, "/");

    // OG image: a freeform homepage published by direct snapshot write (no SEO
    // panel) has `ogImageUrl: null`, so without a fallback NO image is emitted
    // and the link unfurls bare on WhatsApp / iMessage / Instagram. Fall back —
    // tenant-aware, NOT hardcoded — to the tenant's own default share image
    // (identity `seo_default_share_image_media_asset_id`), then a platform
    // default. Crawlers require an ABSOLUTE URL, so coerce relative paths
    // against the request host (per-tenant) and absolutize the rest against the
    // metadataBase.
    const ogImageRaw =
      homepage?.ogImageUrl ??
      identityShareImage ??
      PLATFORM_DEFAULT_OG_IMAGE_PATH;
    const ogImage = toAbsoluteUrl(
      ogImageRaw,
      ctx.hostname,
      localeAlternates.metadataBase,
    );
    const ogTitle = homepage?.ogTitle || title;
    const ogDescription = homepage?.ogDescription || description;

    return {
      title,
      description,
      robots: homepage?.noindex ? { index: false, follow: false } : undefined,
      openGraph: {
        title: ogTitle,
        description: ogDescription,
        siteName: brandName,
        url: ctx.hostname ? `https://${ctx.hostname}/` : undefined,
        images: ogImage ? [{ url: ogImage }] : undefined,
      },
      twitter: {
        // Mirror openGraph so X / Twitter and the many apps that read the
        // twitter:* tags (iMessage, some Slack unfurlers) get a large image
        // card too — same pattern as the marketing branch below.
        card: "summary_large_image",
        title: ogTitle,
        description: ogDescription,
        images: ogImage ? [ogImage] : undefined,
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
    // The positioning line in the reader's language, and NOT the brand name.
    //
    // The root layout's title template is `%s · Tulala`, so anything returned
    // here gets the brand appended. Returning "Tulala · <descriptor>" produced
    // `Tulala · Sell what you do, not what you ship · Tulala` on the live
    // homepage: the brand printed twice, on the highest-authority page we own,
    // in the 60 characters search results actually show.
    //
    // The descriptor comes from the marketing copy module so the tagline has a
    // single source per locale; `/es` gets the Spanish line, which is the one
    // meta tag a Spanish searcher reads before deciding to click.
    const title = getMarketingCopy(locale).brand.descriptor;
    const description = pickLocale(locale, {
      en: PLATFORM_BRAND.description,
      es: "Tulala es la plataforma de comercio para el talento: una tienda con tu marca, un pipeline de reservas estructurado y la red de descubrimiento compartida que te trae trabajo nuevo.",
    });
    const marketingAlt = buildMarketingLocaleAlternates(locale, "/");
    return {
      title,
      description,
      ...marketingAlt,
      openGraph: {
        // Social cards do not go through the title template, so the brand has
        // to be present here or the card reads as an unattributed slogan.
        title: `${PLATFORM_BRAND.name} · ${title}`,
        description,
        siteName: PLATFORM_BRAND.name,
        url: `https://${PLATFORM_BRAND.domain}/`,
      },
      twitter: {
        card: "summary_large_image",
        // Same reason as openGraph: no template runs on a social card.
        title: `${PLATFORM_BRAND.name} · ${title}`,
        description,
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
        // Builder-authored home. `CmsPublicPage` is rendered here from the
        // route-group ROOT (app/page.tsx), OUTSIDE `(public)/layout.tsx`, so it
        // gets neither the discovery/inquiry providers nor the guest-chat
        // launcher that the legacy `AgencyHomeStorefront` mounts. Wrap it in
        // `PublicChatSurface` (the same provider stack as the layout) + mount the
        // launcher gated on `show_on_home` (sourcePage "/"). Pass
        // `mountChatLauncher={false}` so `CmsPublicPage`'s own generic /p mount
        // doesn't double up here.
        return (
          <PublicChatSurface sourcePage="/">
            <CmsPublicPage
              params={Promise.resolve({ slug: [homeSlug] })}
              mountChatLauncher={false}
            />
          </PublicChatSurface>
        );
      }
      return <AgencyHomeStorefront tenantId={ctx.tenantId} />;
    }
    case "hub":
      // Phase 5/6 M1 — hub now carries its tenantId (the hub agency UUID)
      // so it consumes the same CMS reads as agency tenants.
      //
      // W3 — the hub landing is served from this route-group ROOT (app/page.tsx),
      // OUTSIDE `(public)/layout.tsx`, so like the builder-authored agency home it
      // gets neither the discovery/inquiry providers nor the guest-chat launcher.
      // Wrap it in `PublicChatSurface` (same provider stack as the layout) + mount
      // the launcher gated on the hub tenant's `show_on_home` flag (sourcePage
      // "/"). On a hub host the launcher self-brands as "Tulala Concierge".
      return (
        <PublicChatSurface sourcePage="/">
          <HubLanding tenantId={ctx.tenantId} />
        </PublicChatSurface>
      );
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
