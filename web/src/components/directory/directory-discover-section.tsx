import { Suspense } from "react";
import { getPublicDirectoryFirstPage } from "@/lib/directory/cache";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import {
  parseDirectoryAgeRange,
  parseDirectoryAiSummary,
  parseDirectoryFieldFacets,
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
import { getPublicHostContext, getPublicTenantScope } from "@/lib/saas/scope";
import {
  DirectoryFiltersSkeleton,
  DirectoryGridSkeleton,
} from "./directory-skeleton";
import { DiscoveryStateBridge } from "./public-discovery-state";
import { DirectoryFiltersSidebar } from "./directory-filters-sidebar";
import { DirectoryInfiniteGrid } from "./directory-infinite";
import { DirectoryMobileFilters } from "./directory-mobile-filters";
import { collectFitSlugsFromCards } from "@/lib/directory/collect-fit-slugs-from-cards";
import { DirectoryMatchFitProvider } from "./directory-match-fit-context";
import { DirectoryRefineSuggestions } from "./directory-refine-suggestions";
import { DirectoryUnderstandingStrip } from "./directory-understanding-strip";
import { DirectoryResultsToolbar } from "./directory-results-toolbar";
import { DirectoryTalentTypeBar } from "./directory-talent-type-bar";
import type { DirectoryFieldFacetSelection, DirectorySortValue } from "@/lib/directory/types";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocalePath } from "@/i18n/pathnames";
import { logServerError } from "@/lib/server/safe-error";
import { createTranslator } from "@/i18n/messages";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { buildDirectoryInterpretedSummaryLine } from "@/lib/directory/build-directory-interpreted-summary";

function buildDirectorySourcePage({
  locale,
  query,
  locationSlug,
  sort,
  taxonomyTermIds,
  heightMinCm,
  heightMaxCm,
  ageMin,
  ageMax,
  fieldFacets,
  view,
  aiSummary,
}: {
  locale: string;
  query: string;
  locationSlug: string;
  sort: DirectorySortValue;
  taxonomyTermIds: string[];
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  fieldFacets: DirectoryFieldFacetSelection[];
  view: "grid" | "list";
  aiSummary?: string;
}) {
  const qs = serializeCanonicalDirectoryListingParams({
    query,
    locationSlug,
    sort,
    taxonomyTermIds,
    heightMinCm,
    heightMaxCm,
    ageMin,
    ageMax,
    fieldFacets,
    view,
    aiSummary,
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
  ageMin,
  ageMax,
  fieldFacets,
  view,
  aiSummary,
  initialSavedIds,
}: {
  taxonomyTermIds: string[];
  locale: string;
  sort: DirectorySortValue;
  query: string;
  locationSlug: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  fieldFacets: DirectoryFieldFacetSelection[];
  view: "grid" | "list";
  aiSummary: string;
  initialSavedIds: string[];
}) {
  let loadError = false;
  let filterSidebar: Awaited<ReturnType<typeof getCachedDirectoryFilterSidebarModel>> = {
    blocks: [],
  };
  let taxonomyOptions: Awaited<
    ReturnType<typeof getCachedTaxonomyFilterOptions>
  > = [];
  let firstPage: Awaited<ReturnType<typeof getPublicDirectoryFirstPage>> | null =
    null;
  let aiFlags: Awaited<ReturnType<typeof getAiFeatureFlags>> | null = null;

  const hostContext = await getPublicHostContext();
  const directoryTenantId =
    hostContext.kind === "agency" ? hostContext.tenantId : null;

  try {
    [aiFlags, taxonomyOptions, firstPage] = await Promise.all([
      getAiFeatureFlags(),
      getCachedTaxonomyFilterOptions(locale),
      getPublicDirectoryFirstPage({
        taxonomyTermIds,
        locale,
        sort,
        query,
        locationSlug,
        heightMinCm,
        heightMaxCm,
        ageMin,
        ageMax,
        fieldFacetFilters: fieldFacets,
        tenantId: directoryTenantId,
      }),
    ]);
  } catch (e) {
    logServerError("directory/discover-first-page", e);
    loadError = true;
  }

  if (!loadError) {
    try {
      const publicScope = await getPublicTenantScope();
      filterSidebar = await getCachedDirectoryFilterSidebarModel(
        locale,
        {
          taxonomyTermIds,
          locationSlug,
          heightMinCm,
          heightMaxCm,
          ageMin,
          ageMax,
          query,
          fieldFacets,
        },
        publicScope?.tenantId ?? null,
      );
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
  const aiSearchEnabled = Boolean(aiFlags?.ai_master_enabled && aiFlags.ai_search_enabled);
  const aiRefineEnabled = Boolean(aiFlags?.ai_master_enabled && aiFlags.ai_refine_enabled);

  const interpretedStructuredLine = buildDirectoryInterpretedSummaryLine({
    taxonomyOptions,
    selectedTaxonomyIds: taxonomyTermIds,
    locationSlug,
    heightMinCm,
    heightMaxCm,
    heightUnitLabel: ui.intent.heightUnitCm,
  });

  return (
    <>
      {filterSidebar.topBarFacet ? (
        <DirectoryTalentTypeBar
          options={filterSidebar.topBarFacet.options}
          selectedIds={taxonomyTermIds}
          allLabel={ui.topBarPills.all}
          barAriaLabel={filterSidebar.topBarFacet.label}
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
              ageMin,
              ageMax,
              fieldFacets,
              view,
              aiSummary: aiSummary.trim() || undefined,
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
              ageMin={ageMin}
              ageMax={ageMax}
              fieldFacets={fieldFacets}
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
              ageMin={ageMin}
              ageMax={ageMax}
              fieldFacets={fieldFacets}
              ui={ui}
            />
          </div>

          <DirectoryMatchFitProvider
            initialSlugs={collectFitSlugsFromCards(firstPage.items)}
          >
            <DirectoryUnderstandingStrip
              aiSummary={aiSummary}
              showSummary={aiSearchEnabled}
              interpretedStructuredLine={interpretedStructuredLine}
              taxonomyOptions={taxonomyOptions}
              selectedIds={taxonomyTermIds}
              query={query}
              locationSlug={locationSlug}
              heightMinCm={heightMinCm}
              heightMaxCm={heightMaxCm}
              ui={ui}
            />
            <DirectoryResultsToolbar
              totalCount={firstPage.totalCount ?? 0}
              sort={sort}
              view={view}
              ui={ui}
            />

            {aiRefineEnabled ? (
              <DirectoryRefineSuggestions
                locale={locale}
                query={query}
                locationSlug={locationSlug}
                selectedTaxonomyIds={taxonomyTermIds}
                heightMinCm={heightMinCm}
                heightMaxCm={heightMaxCm}
                ui={ui}
              />
            ) : null}

            <DirectoryInfiniteGrid
              key={`${locale}|${serializeCanonicalDirectoryListingParams({
                query,
                locationSlug,
                sort,
                taxonomyTermIds,
                heightMinCm,
                heightMaxCm,
                ageMin,
                ageMax,
                fieldFacets,
                view,
                aiSummary,
              })}`}
              taxonomyTermIds={taxonomyTermIds}
              initialPage={firstPage}
              locale={locale}
              sort={sort}
              query={query}
              locationSlug={locationSlug}
              heightMinCm={heightMinCm}
              heightMaxCm={heightMaxCm}
              ageMin={ageMin}
              ageMax={ageMax}
              fieldFacets={fieldFacets}
              view={view}
              initialSavedIds={initialSavedIds}
              ui={ui}
              directorySearchViaAi={aiSearchEnabled}
            />
          </DirectoryMatchFitProvider>
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
  const { ageMin, ageMax } = parseDirectoryAgeRange({
    amin: searchParams.amin,
    amax: searchParams.amax,
  });
  const view = parseDirectoryView(searchParams);
  const aiSummary = parseDirectoryAiSummary(searchParams.ai_sum);
  const fieldFacets = parseDirectoryFieldFacets(searchParams.ff);

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
        ageMin={ageMin}
        ageMax={ageMax}
        fieldFacets={fieldFacets}
        view={view}
        aiSummary={aiSummary}
        initialSavedIds={initialSavedIds}
      />
    </Suspense>
  );
}
