import { Suspense } from "react";
import { getCachedDirectoryFirstPage } from "@/lib/directory/cache";
import {
  parseDirectoryHeightRange,
  parseDirectoryLocation,
  parseDirectoryQuery,
  parseDirectorySort,
  parseDirectoryView,
  parseTaxonomyParam,
  serializeCanonicalDirectoryListingParams,
} from "@/lib/directory/search-params";
import { getCachedTaxonomyFilterOptions } from "@/lib/directory/taxonomy-filters";
import { getCachedDirectoryFilterSidebarModel } from "@/lib/directory/field-driven-filters";
import {
  DirectoryFiltersSkeleton,
  DirectoryGridSkeleton,
} from "./directory-skeleton";
import { DiscoveryStateBridge } from "./public-discovery-state";
import { DirectoryFiltersSidebar } from "./directory-filters-sidebar";
import { DirectoryInfiniteGrid } from "./directory-infinite";
import { DirectoryMobileFilters } from "./directory-mobile-filters";
import { DirectoryResultsToolbar } from "./directory-results-toolbar";
import { DirectoryTalentTypeBar } from "./directory-talent-type-bar";
import type { DirectorySortValue } from "@/lib/directory/types";
import type { Locale } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocalePath } from "@/i18n/pathnames";
import { logServerError } from "@/lib/server/safe-error";
import { createTranslator } from "@/i18n/messages";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

function buildDirectorySourcePage({
  locale,
  query,
  locationSlug,
  sort,
  taxonomyTermIds,
  heightMinCm,
  heightMaxCm,
  view,
}: {
  locale: Locale;
  query: string;
  locationSlug: string;
  sort: DirectorySortValue;
  taxonomyTermIds: string[];
  heightMinCm: number | null;
  heightMaxCm: number | null;
  view: "grid" | "list";
}) {
  const qs = serializeCanonicalDirectoryListingParams({
    query,
    locationSlug,
    sort,
    taxonomyTermIds,
    heightMinCm,
    heightMaxCm,
    view,
  });
  const path = qs ? `/directory?${qs}` : "/directory";
  return withLocalePath(path, locale);
}

async function DirectoryDiscoverInner({
  taxonomyTermIds,
  locale,
  sort,
  query,
  locationSlug,
  heightMinCm,
  heightMaxCm,
  view,
  initialSavedIds,
}: {
  taxonomyTermIds: string[];
  locale: "en" | "es";
  sort: DirectorySortValue;
  query: string;
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  view: "grid" | "list";
  initialSavedIds: string[];
}) {
  let loadError = false;
  let filterSidebar: Awaited<ReturnType<typeof getCachedDirectoryFilterSidebarModel>> = {
    blocks: [],
  };
  let taxonomyOptions: Awaited<
    ReturnType<typeof getCachedTaxonomyFilterOptions>
  > = [];
  let firstPage: Awaited<ReturnType<typeof getCachedDirectoryFirstPage>> | null =
    null;

  try {
    [taxonomyOptions, firstPage] = await Promise.all([
      getCachedTaxonomyFilterOptions(locale),
      getCachedDirectoryFirstPage({
        taxonomyTermIds,
        locale,
        sort,
        query,
        locationSlug,
        heightMinCm,
        heightMaxCm,
      }),
    ]);
  } catch (e) {
    logServerError("directory/discover-first-page", e);
    loadError = true;
  }

  if (!loadError) {
    try {
      filterSidebar = await getCachedDirectoryFilterSidebarModel(locale, {
        taxonomyTermIds,
        locationSlug,
        heightMinCm,
        heightMaxCm,
        query,
      });
    } catch (e) {
      logServerError("directory/discover-filter-sections", e);
      filterSidebar = { blocks: [] };
    }
  }

  if (loadError || !firstPage) {
    const t = createTranslator(locale);
    const uiErr = buildDirectoryUiCopy(t);
    return (
      <div className="rounded-lg border border-dashed border-[var(--impronta-gold-border)] bg-black/20 px-6 py-16 text-center text-m text-[var(--impronta-muted)]">
        {uiErr.discoverLoadError}
      </div>
    );
  }

  const t = createTranslator(locale);
  const ui = buildDirectoryUiCopy(t);

  return (
    <>
      {filterSidebar.topBarTalentType ? (
        <DirectoryTalentTypeBar
          options={filterSidebar.topBarTalentType.options}
          selectedIds={taxonomyTermIds}
          talentType={ui.talentType}
        />
      ) : null}
      <div className="flex gap-8">
        <DiscoveryStateBridge
          savedIds={initialSavedIds}
          searchContext={{
            q: query,
            locationSlug,
            sort,
            taxonomyTermIds,
            sourcePage: buildDirectorySourcePage({
              locale,
              query,
              locationSlug,
              sort,
              taxonomyTermIds,
              heightMinCm,
              heightMaxCm,
              view,
            }),
          }}
        />
        {/* Desktop sidebar */}
        <div className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-20">
            <DirectoryFiltersSidebar
              blocks={filterSidebar.blocks}
              selectedIds={taxonomyTermIds}
              locationSlug={locationSlug}
              heightMinCm={heightMinCm}
              heightMaxCm={heightMaxCm}
              ui={ui}
            />
          </div>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2 md:mb-0 md:hidden">
            <DirectoryMobileFilters
              blocks={filterSidebar.blocks}
              selectedIds={taxonomyTermIds}
              locationSlug={locationSlug}
              heightMinCm={heightMinCm}
              heightMaxCm={heightMaxCm}
              ui={ui}
            />
          </div>

          <DirectoryResultsToolbar
            totalCount={firstPage.totalCount ?? 0}
            taxonomyOptions={taxonomyOptions}
            selectedIds={taxonomyTermIds}
            query={query}
            locationSlug={locationSlug}
            sort={sort}
            heightMinCm={heightMinCm}
            heightMaxCm={heightMaxCm}
            view={view}
            ui={ui}
          />

          <DirectoryInfiniteGrid
            key={`${locale}|${serializeCanonicalDirectoryListingParams({
              query,
              locationSlug,
              sort,
              taxonomyTermIds,
              heightMinCm,
              heightMaxCm,
              view,
            })}`}
            taxonomyTermIds={taxonomyTermIds}
            initialPage={firstPage}
            locale={locale}
            sort={sort}
            query={query}
            locationSlug={locationSlug}
            heightMinCm={heightMinCm}
            heightMaxCm={heightMaxCm}
            view={view}
            initialSavedIds={initialSavedIds}
            ui={ui}
          />
        </div>
      </div>
    </>
  );
}

export async function DirectoryDiscoverSection({
  searchParams,
  initialSavedIds = [],
}: {
  searchParams: Record<string, string | string[] | undefined>;
  initialSavedIds?: string[];
}) {
  const taxonomyTermIds = parseTaxonomyParam(searchParams.tax);
  const locale = await getRequestLocale();
  const sort = parseDirectorySort(searchParams.sort);
  const query = parseDirectoryQuery(searchParams.q);
  const locationSlug = parseDirectoryLocation(searchParams.location);
  const { heightMinCm, heightMaxCm } = parseDirectoryHeightRange({
    hmin: searchParams.hmin,
    hmax: searchParams.hmax,
  });
  const view = parseDirectoryView(searchParams);

  return (
    <Suspense
      fallback={
        <div className="flex gap-8">
          <div className="hidden w-56 shrink-0 md:block">
            <DirectoryFiltersSkeleton />
          </div>
          <div className="flex-1">
            <DirectoryGridSkeleton />
          </div>
        </div>
      }
    >
      <DirectoryDiscoverInner
        taxonomyTermIds={taxonomyTermIds}
        locale={locale}
        sort={sort}
        query={query}
        locationSlug={locationSlug}
        heightMinCm={heightMinCm}
        heightMaxCm={heightMaxCm}
        view={view}
        initialSavedIds={initialSavedIds}
      />
    </Suspense>
  );
}
