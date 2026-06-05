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
  type DirectoryActiveFilters,
} from "@/components/marketing/directory/shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Talent directory",
  description:
    "Browse talent from across the entire network — independents and agency rosters alike. Search by craft, location, and availability.",
};

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

  return (
    <>
      <section
        className="border-b"
        style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg)" }}
      >
        <MarketingContainer size="wide" className="pb-10 pt-14 sm:pt-20">
          <div className="max-w-2xl">
            <MarketingEyebrow>The global directory</MarketingEyebrow>
            <h1
              className="plt-display mt-5 text-[2.25rem] font-medium leading-[1.03] tracking-[-0.02em] sm:text-[3rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              Every roster,
              <br />
              <span style={{ color: "var(--plt-forest)" }}>one directory.</span>
            </h1>
            <p
              className="mt-5 max-w-xl text-[1.0625rem] leading-[1.6]"
              style={{ color: "var(--plt-muted)" }}
            >
              Browse talent from across the entire {PLATFORM_BRAND.name} network — independents and
              agency rosters alike. Search by craft, location, and availability; every profile is
              here because the talent chose to be seen.
            </p>
          </div>
        </MarketingContainer>
      </section>

      <div className="pt-8">
        <MarketingDirectoryShell
          view={view}
          sort={sort}
          facets={facets}
          activeFilters={activeFilters}
          initialItems={gridData.items}
          initialTotal={gridData.total}
          pageSize={DIRECTORY_PAGE_SIZE}
          mapPoints={mapData.points}
          mapUnmappedCount={mapData.unmappedCount}
          mapApiKey={mapApiKey}
        />
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
