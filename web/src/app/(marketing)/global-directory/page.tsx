// Public Global Talent Directory — platform-wide, cross-tenant browse surface
// on the marketing apex (tulala.digital/directory).
//
// Reads ONLY the discoverable set the materialized view exposes
// (is_discoverable + workflow_status in approved/published) via the
// cross-tenant discover bridge. It does not tenant-scope and does not widen
// that set. Browse / discovery only — no pricing, no commission, no checkout.
//
// Lives in the (marketing) route group, so MarketingShell (header / footer /
// --plt-* token scope) is inherited from the group layout — do NOT re-wrap.

import type { Metadata } from "next";
import {
  loadDirectoryFacets,
  loadDiscoverTalents,
  loadDiscoverMapPoints,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/discover";
import { readGoogleMapsBrowserKey } from "@/lib/env/google-maps-browser-key";
import { MarketingContainer, MarketingEyebrow } from "@/components/marketing/container";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingDirectoryShell } from "@/components/marketing/directory/MarketingDirectoryShell";
import { AgencyChatLauncherMount } from "@/app/(public)/_chat/AgencyChatLauncherMount";
import {
  DIRECTORY_PAGE_SIZE,
  cleanParam,
  isTruthyFlag,
  normalizeSort,
  normalizeView,
  locationLine,
  type DirectoryActiveFilters,
} from "@/components/marketing/directory/shared";
import { resolveCardDesign } from "@/lib/site-admin/server/card-design-resolver";
import { DEFAULT_CARD_DESIGN } from "@/lib/site-admin/server/card-design-shape";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { getFavoriteTalentIds, getSavedTalentIds } from "@/lib/public-discovery";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";

export const dynamic = "force-dynamic";

// The public URL is /directory (proxy.ts rewrites it to this /global-directory
// route), so canonical + hreflang MUST point at /directory, never the internal
// path. Hire-intent title/description: ES leads on "agencia de talento" (the
// 100–1K/mo, LOW-competition term our Keyword Planner data surfaced), because
// demand-side Spanish is the primary query for this market.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "Hire vetted talent: models, chefs, photographers and more",
      es: "Agencia de talento: contrata modelos, chefs y fotógrafos",
    }),
    description: pickLocale(locale, {
      en: `Browse and hire talent from across the ${PLATFORM_BRAND.name} network, independents and agency rosters alike. Search by craft, location, and availability, then send a structured inquiry.`,
      es: `Explora y contrata talento de toda la red de ${PLATFORM_BRAND.name}, independientes y rosters de agencia por igual. Busca por oficio, ubicación y disponibilidad, y envía una consulta estructurada.`,
    }),
    ...buildMarketingLocaleAlternates(locale, "/directory"),
  };
}

type PageSearchParams = Promise<{
  q?: string;
  country?: string;
  city?: string;
  tax?: string;
  trust?: string;
  avail?: string;
  view?: string;
  sort?: string;
}>;

export default async function MarketingDirectoryPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const sp = await searchParams;
  const locale = await getRequestLocale();

  const view = normalizeView(sp.view);
  const sort = normalizeSort(sp.sort);
  const activeFilters: DirectoryActiveFilters = {
    q: cleanParam(sp.q),
    country: cleanParam(sp.country),
    city: cleanParam(sp.city),
    category: cleanParam(sp.tax),
    trustTier: cleanParam(sp.trust),
    availableOnly: isTruthyFlag(sp.avail),
  };

  const isMap = view === "map";

  // Parallel SSR loads: facets always; then either the first grid/list page
  // or the (cap-500) map point set — never both.
  const [facets, gridData, mapData] = await Promise.all([
    loadDirectoryFacets(),
    isMap
      ? Promise.resolve({ items: [], total: 0 })
      : loadDiscoverTalents({
          q: activeFilters.q ?? undefined,
          country: activeFilters.country ?? undefined,
          city: activeFilters.city ?? undefined,
          category: activeFilters.category ?? undefined,
          trustTier: activeFilters.trustTier ?? undefined,
          availableOnly: activeFilters.availableOnly || undefined,
          sort,
          limit: DIRECTORY_PAGE_SIZE,
          offset: 0,
        }),
    isMap
      ? loadDiscoverMapPoints({
          q: activeFilters.q ?? undefined,
          country: activeFilters.country ?? undefined,
          city: activeFilters.city ?? undefined,
          category: activeFilters.category ?? undefined,
          trustTier: activeFilters.trustTier ?? undefined,
          availableOnly: activeFilters.availableOnly || undefined,
        })
      : Promise.resolve({ points: [], unmappedCount: 0 }),
  ]);

  const mapApiKey = isMap ? (readGoogleMapsBrowserKey() ?? null) : null;

  // ONE card design for the whole grid: the platform hub tenant's (the
  // workspace whose admin Card Design page labels this surface "Directory ·
  // PUBLIC"). The previous per-owning-agency resolution transplanted each
  // agency's palette onto the light platform canvas half-applied — a tenant
  // tuned for its own dark storefront rendered cream-on-white names and black
  // badge boxes here, and the grid mixed card families row by row. A public
  // marketplace grid reads as ONE product: uniform family, palette, aspect and
  // density, all controlled from the hub workspace's Card Design admin.
  const hub = await getPlatformHubTenant();
  const hubDesign = hub
    ? await resolveCardDesign(hub.tenantId)
    : DEFAULT_CARD_DESIGN;
  const gridItems = gridData.items.map((row) => ({ ...row, design: hubDesign }));
  // Card actions (favorite heart + inquire pill) need the discovery-state
  // provider; both hooks are guest-capable (localStorage mirror + guest RPCs),
  // so a signed-out visitor's favorites/lineup persist for their session.
  const [initialSavedIds, initialFavoriteIds] = await Promise.all([
    getSavedTalentIds(),
    getFavoriteTalentIds(),
  ]);
  const mapPoints = mapData.points.map((point) => ({
    ...point,
    design: hubDesign,
  }));

  const origin = `https://${PLATFORM_BRAND.domain}`;

  // BreadcrumbList: Home > Directory. Always emitted.
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: PLATFORM_BRAND.name, url: `${origin}/` },
    {
      name: pickLocale(locale, { en: "Directory", es: "Directorio" }),
      url: `${origin}/directory`,
    },
  ]);

  // ItemList JSON-LD built ONLY from the talent this page actually server-
  // renders (the SSR grid page). Map view renders no grid items, and rows
  // loaded later by the load-more action aren't in the initial markup, so we
  // never assert a listing the crawler cannot see. Each entry links to the
  // talent's own profile page.
  const listItems = gridItems.filter((t) => Boolean(t.profileCode));
  const itemListJsonLd =
    listItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: listItems.map((t, i) => {
            const location = locationLine(t.homeCity, t.homeCountry);
            return {
              "@type": "ListItem",
              position: i + 1,
              url: `${origin}/t/${encodeURIComponent(t.profileCode!)}`,
              name: [t.displayName, t.primaryTypeLabel, location]
                .filter(Boolean)
                .join(", "),
            };
          }),
        }
      : null;

  const c = pickLocale(locale, {
    en: {
      eyebrow: "The global directory",
      titleA: "Hire from every roster,",
      titleB: "in one directory.",
      body: `Browse and hire talent from across the entire ${PLATFORM_BRAND.name} network, independents and agency rosters alike. Search by craft, location, and availability; every profile is here because the talent chose to be seen.`,
    },
    es: {
      eyebrow: "El directorio global",
      titleA: "Contrata de cada roster,",
      titleB: "en un solo directorio.",
      body: `Explora y contrata talento de toda la red de ${PLATFORM_BRAND.name}, independientes y rosters de agencia por igual. Busca por oficio, ubicación y disponibilidad; cada perfil está aquí porque el talento eligió mostrarse.`,
    },
  });

  return (
    <>
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          // Pre-stringified: React must NOT escape JSON-LD content.
          dangerouslySetInnerHTML={{
            __html: breadcrumbJsonLdToString(breadcrumbJsonLd),
          }}
        />
      ) : null}
      {itemListJsonLd ? (
        <script
          type="application/ld+json"
          // Escape "</" defensively so a talent display name can never break
          // out of the <script> element.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListJsonLd).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}
      <section
        className="border-b"
        style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg)" }}
      >
        <MarketingContainer size="wide" className="pb-10 pt-14 sm:pt-20">
          <div className="max-w-2xl">
            <MarketingEyebrow>{c.eyebrow}</MarketingEyebrow>
            <h1
              className="plt-display mt-5 text-[2.25rem] font-medium leading-[1.03] tracking-[-0.02em] sm:text-[3rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              {c.titleA}
              <br />
              <span style={{ color: "var(--plt-forest)" }}>{c.titleB}</span>
            </h1>
            <p
              className="mt-5 max-w-xl text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              {c.body}
            </p>
          </div>
        </MarketingContainer>
      </section>

      <div className="pt-8">
        <PublicDiscoveryStateProvider
          initialSavedIds={initialSavedIds}
          initialFavoriteIds={initialFavoriteIds}
        >
          <MarketingDirectoryShell
            view={view}
            sort={sort}
            facets={facets}
            activeFilters={activeFilters}
            initialItems={gridItems}
            initialTotal={gridData.total}
            pageSize={DIRECTORY_PAGE_SIZE}
            mapPoints={mapPoints}
            mapUnmappedCount={mapData.unmappedCount}
            mapApiKey={mapApiKey}
          />
        </PublicDiscoveryStateProvider>
      </div>

      {/* Floating "Message {hub}" guest-chat launcher. On the marketing apex
          this self-resolves the platform hub (getPlatformHubTenant) and gates
          on the hub's guest-chat settings (enabled + show-on-directory). This
          is the directory served at tulala.digital/directory (the /directory →
          /global-directory rewrite), so the launcher belongs here. */}
      <AgencyChatLauncherMount sourcePage="/directory" />
    </>
  );
}
