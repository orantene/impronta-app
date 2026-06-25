"use client";

import {
  Suspense,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  parseTaxonomyParam,
  parseDirectorySort,
  parseDirectoryQuery,
  parseDirectoryLocation,
  parseDirectoryHeightRange,
  parseDirectoryAgeRange,
  parseDirectoryView,
  parseDirectoryFieldFacets,
} from "@/lib/directory/search-params";
import type {
  DirectoryPageResponse,
  DirectoryFieldFacetSelection,
} from "@/lib/directory/types";
import { DIRECTORY_SORT_VALUES, type DirectorySortValue } from "@/lib/directory/types";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import type { DirectoryFilterSidebarBlock } from "@/lib/directory/field-driven-filters";
import { DirectoryTalentTypeBar } from "@/components/directory/directory-talent-type-bar";
import { DirectoryResultsToolbar } from "@/components/directory/directory-results-toolbar";
import { DirectoryFiltersSidebar } from "@/components/directory/directory-filters-sidebar";
import { DirectoryMobileFilters } from "@/components/directory/directory-mobile-filters";
import { DirectoryQueryProvider } from "@/components/directory/query-provider";

import { AIInterpretChip } from "./AIInterpretChip";
import { DirectoryActiveFilterChips } from "./DirectoryActiveFilterChips";
import { DirectoryReactiveGrid } from "./DirectoryReactiveGrid";
import { DirectoryInquiryReviewBar } from "@/components/directory/directory-inquiry-review-bar";
import { DirectoryMapView } from "./DirectoryMapView";
import type { DirectoryCategoryParent } from "@/lib/directory/directory-category-tree";
import type { DirectoryV1 } from "./schema";

/**
 * Top-bar facet model shape (mirrors `DirectoryTopBarFacetModel` without
 * importing the full sidebar-types module). Carries the catalog options
 * that drive the talent-type pill bar.
 */
export type DirectoryTopBarFacetPropShape = {
  label: string;
  options: { id: string; label: string; count?: number }[];
};

/**
 * Client island that makes the portable Directory section reactive.
 * Reads the live URL via `useSearchParams()`, parses with the pure
 * (server+client safe) helpers from `lib/directory/search-params`, and
 * mounts the section-owned `<DirectoryReactiveGrid>` against the public
 * `/api/directory` endpoint. Filter controls (talent-type pill bar,
 * desktop sidebar, mobile filters, results toolbar) are the existing
 * legacy components — they already `usePathname() + useSearchParams() +
 * commitDirectoryListingUrl`, so the path-aware `clientDirectoryHref`
 * keeps every navigation on the section's own URL.
 *
 * B3 — Card visual layer is now the canonical `<DirectoryCard>` via
 * `<DirectoryCardAdapter>` inside `<DirectoryReactiveGrid>`. The legacy
 * `<TalentCard>` + `<DirectoryInfiniteGrid>` are no longer mounted by
 * this section. Trust/agency/availability badges ride along on Lane 5's
 * enriched DTO (with honest fallbacks when fields are unset).
 */
export function DirectoryReactiveResults({
  initialPage,
  mapApiKey,
  categoryTree,
  locale,
  ui,
  topBarFacet,
  sidebarBlocks,
  defaultSort,
  showTopBar,
  showSidebar,
  showSort,
  showResultCount,
  showActiveChips,
  aiSearchEnabled = false,
  scopeLimitedHint,
  cardKitOverrideStyle,
  sidebarPosition,
  sidebarSticky,
  scope,
  manualProfileCodes,
  density,
  hoverBehavior,
  cardStyle,
  cardAspect,
  showName,
  showTalentType,
  showLocation,
  showAvailability,
  showBadges,
  showSave,
  showAddToInquiry,
  cardFieldKeys,
  maxFieldLines,
  nameFallback,
  columnsDesktop,
  columnsTablet,
  columnsMobile,
}: {
  /** Server-fetched first page (unfiltered for the section scope). */
  initialPage: DirectoryPageResponse;
  /** Google Maps browser key for the map view (null when unconfigured). */
  mapApiKey?: string | null;
  /** Two-level parent→child category model for the top bar (empty = flat). */
  categoryTree?: DirectoryCategoryParent[];
  locale: "en" | "es";
  ui: DirectoryUiCopy;
  /** When set, the pill bar renders this facet. */
  topBarFacet?: DirectoryTopBarFacetPropShape;
  /** Sidebar blocks (full filter facets). Empty = no sidebar. */
  sidebarBlocks: DirectoryFilterSidebarBlock[];
  /** Section's `defaultSort` (DirectoryV1 enum — maps to engine values). */
  defaultSort: DirectoryV1["defaultSort"];
  showTopBar: boolean;
  showSidebar: boolean;
  showSort: boolean;
  showResultCount: boolean;
  showActiveChips: boolean;
  aiSearchEnabled?: boolean;
  /** Honest hint when `scope=by_tag` cannot project; rendered above grid. */
  scopeLimitedHint?: string;
  /**
   * P4 — inline `--token-card-*` CSS vars from a resolved per-instance card
   * kit. Set on a wrapper around the grid so THIS instance's canonical cards
   * paint in the override palette regardless of the tenant default. Inline
   * vars only (publishPageSnapshot does not bake classes).
   */
  cardKitOverrideStyle?: CSSProperties;
  /** Filter sidebar placement (`left`/`right`) — orders the aside via flex. */
  sidebarPosition: DirectoryV1["sidebarPosition"];
  /** Whether the desktop filter aside is sticky. */
  sidebarSticky: boolean;
  /** Section scope — drives the render-level manual-pick filter. */
  scope: DirectoryV1["scope"];
  /** Resolved manual profile codes (in pick order) when `scope=manual`. */
  manualProfileCodes: string[];
  density: DirectoryV1["density"];
  hoverBehavior: DirectoryV1["hoverBehavior"];
  // B3 — card-level config threaded through to the new reactive grid.
  cardStyle: DirectoryV1["cardStyle"];
  cardAspect: DirectoryV1["cardAspect"];
  showName: boolean;
  showTalentType: boolean;
  showLocation: boolean;
  showAvailability: boolean;
  showBadges: boolean;
  /** Render the per-card favorite (save) affordance. */
  showSave: boolean;
  /** Render the per-card "Inquire / Added" cart bar. */
  showAddToInquiry: boolean;
  /** Catalog-field allow-list + order for the card trait row. */
  cardFieldKeys: DirectoryV1["cardFieldKeys"];
  /** Cap on the card trait lines. */
  maxFieldLines: DirectoryV1["maxFieldLines"];
  nameFallback: DirectoryV1["nameFallback"];
  columnsDesktop: number;
  columnsTablet: number;
  columnsMobile: number;
}) {
  return (
    <DirectoryQueryProvider>
      <Suspense fallback={null}>
        <DirectoryReactiveResultsInner
          initialPage={initialPage}
          mapApiKey={mapApiKey}
          categoryTree={categoryTree}
          locale={locale}
          ui={ui}
          topBarFacet={topBarFacet}
          sidebarBlocks={sidebarBlocks}
          defaultSort={defaultSort}
          showTopBar={showTopBar}
          showSidebar={showSidebar}
          showSort={showSort}
          showResultCount={showResultCount}
          showActiveChips={showActiveChips}
          aiSearchEnabled={aiSearchEnabled}
          scopeLimitedHint={scopeLimitedHint}
          cardKitOverrideStyle={cardKitOverrideStyle}
          sidebarPosition={sidebarPosition}
          sidebarSticky={sidebarSticky}
          scope={scope}
          manualProfileCodes={manualProfileCodes}
          density={density}
          hoverBehavior={hoverBehavior}
          cardStyle={cardStyle}
          cardAspect={cardAspect}
          showName={showName}
          showTalentType={showTalentType}
          showLocation={showLocation}
          showAvailability={showAvailability}
          showBadges={showBadges}
          showSave={showSave}
          showAddToInquiry={showAddToInquiry}
          cardFieldKeys={cardFieldKeys}
          maxFieldLines={maxFieldLines}
          nameFallback={nameFallback}
          columnsDesktop={columnsDesktop}
          columnsTablet={columnsTablet}
          columnsMobile={columnsMobile}
        />
      </Suspense>
    </DirectoryQueryProvider>
  );
}

/**
 * Map the section's `defaultSort` enum onto the engine's `DirectorySortValue`.
 * Engine accepts: `recommended | featured | recent | updated` only — the
 * `az | availability | curated` section enums fall back to `recommended`
 * (honest: they're surfaced in the editor but not yet a sort key on the
 * directory engine).
 */
function mapDefaultSort(s: DirectoryV1["defaultSort"]): DirectorySortValue {
  if (s === "newest") return "recent";
  if (s === "recommended") return "recommended";
  // az / availability / curated → fall back honestly to recommended
  return "recommended";
}

function DirectoryReactiveResultsInner({
  initialPage,
  mapApiKey,
  categoryTree,
  locale,
  ui,
  topBarFacet,
  sidebarBlocks,
  defaultSort,
  showTopBar,
  showSidebar,
  showSort,
  showResultCount,
  showActiveChips,
  aiSearchEnabled,
  scopeLimitedHint,
  cardKitOverrideStyle,
  sidebarPosition,
  sidebarSticky,
  scope,
  manualProfileCodes,
  density,
  hoverBehavior,
  cardStyle,
  cardAspect,
  showName,
  showTalentType,
  showLocation,
  showAvailability,
  showBadges,
  showSave,
  showAddToInquiry,
  cardFieldKeys,
  maxFieldLines,
  nameFallback,
  columnsDesktop,
  columnsTablet,
  columnsMobile,
}: {
  initialPage: DirectoryPageResponse;
  mapApiKey?: string | null;
  categoryTree?: DirectoryCategoryParent[];
  locale: "en" | "es";
  ui: DirectoryUiCopy;
  topBarFacet?: DirectoryTopBarFacetPropShape;
  sidebarBlocks: DirectoryFilterSidebarBlock[];
  defaultSort: DirectoryV1["defaultSort"];
  showTopBar: boolean;
  showSidebar: boolean;
  showSort: boolean;
  showResultCount: boolean;
  showActiveChips: boolean;
  aiSearchEnabled: boolean;
  scopeLimitedHint?: string;
  cardKitOverrideStyle?: CSSProperties;
  sidebarPosition: DirectoryV1["sidebarPosition"];
  sidebarSticky: boolean;
  scope: DirectoryV1["scope"];
  manualProfileCodes: string[];
  density: DirectoryV1["density"];
  hoverBehavior: DirectoryV1["hoverBehavior"];
  cardStyle: DirectoryV1["cardStyle"];
  cardAspect: DirectoryV1["cardAspect"];
  showName: boolean;
  showTalentType: boolean;
  showLocation: boolean;
  showAvailability: boolean;
  showBadges: boolean;
  showSave: boolean;
  showAddToInquiry: boolean;
  cardFieldKeys: DirectoryV1["cardFieldKeys"];
  maxFieldLines: DirectoryV1["maxFieldLines"];
  nameFallback: DirectoryV1["nameFallback"];
  columnsDesktop: number;
  columnsTablet: number;
  columnsMobile: number;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();

  // Parse the URL once per render via the pure helpers. Mirror the same
  // record shape the helpers expect (string | string[] | undefined).
  const record = useMemo(() => {
    const r: Record<string, string | string[] | undefined> = {};
    sp.forEach((v, k) => {
      const existing = r[k];
      if (existing === undefined) {
        r[k] = v;
      } else if (Array.isArray(existing)) {
        existing.push(v);
      } else {
        r[k] = [existing, v];
      }
    });
    return r;
  }, [sp]);

  const taxonomyTermIds = parseTaxonomyParam(record.tax);
  // Sort: prefer URL value; else section's defaultSort mapped onto engine.
  // `parseDirectorySort` only returns an engine-valid value, never section
  // values like `az` — so falling back to `mapDefaultSort` is safe.
  const sort: DirectorySortValue =
    sp.get("sort") &&
    DIRECTORY_SORT_VALUES.includes(sp.get("sort") as DirectorySortValue)
      ? parseDirectorySort(record.sort)
      : mapDefaultSort(defaultSort);
  const query = parseDirectoryQuery(record.q);
  const locationSlug = parseDirectoryLocation(record.location);
  const { heightMinCm, heightMaxCm } = parseDirectoryHeightRange({
    hmin: record.hmin,
    hmax: record.hmax,
  });
  const { ageMin, ageMax } = parseDirectoryAgeRange({
    amin: record.amin,
    amax: record.amax,
  });
  // B6 — surface the AI interpretation back to the visitor when present.
  const aiSummary = (() => {
    const raw = record.ai_sum;
    if (typeof raw === "string") return raw.trim().slice(0, 400);
    if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim().slice(0, 400);
    return "";
  })();
  const view = parseDirectoryView(record);
  const fieldFacets: DirectoryFieldFacetSelection[] = parseDirectoryFieldFacets(
    record.ff,
  );

  // B5 — label maps for the active-filter chips. Resolve term-ids /
  // facet-value-ids → display labels by walking the same catalog data
  // the pill bar + sidebar render from (topBarFacet + sidebarBlocks).
  const { labelById, fieldLabelByKey } = useMemo(() => {
    const labels: Record<string, string> = {};
    const fieldLabels: Record<string, string> = {};
    for (const opt of topBarFacet?.options ?? []) {
      labels[opt.id] = opt.label;
    }
    // Parent-category + child-type labels so the active-filter chip resolves a
    // hierarchical `?tax=` selection (e.g. "Models") instead of the raw term id.
    for (const parent of categoryTree ?? []) {
      labels[parent.id] = parent.label;
      for (const child of parent.children) labels[child.id] = child.label;
    }
    for (const block of sidebarBlocks) {
      if (block.kind !== "section") continue;
      const section = block.section;
      if ("options" in section) {
        fieldLabels[section.fieldKey] = section.label;
        for (const opt of section.options) {
          labels[opt.id] = opt.label;
        }
      }
    }
    return { labelById: labels, fieldLabelByKey: fieldLabels };
  }, [topBarFacet, sidebarBlocks, categoryTree]);

  // Propagate grid refetch state up to the toolbar so the result count
  // dims while a filter change is in flight (Task 4).
  const [isGridFetching, setIsGridFetching] = useState(false);
  const handleFetchingChange = useCallback((fetching: boolean) => {
    setIsGridFetching(fetching);
  }, []);

  // The grid reports the FILTERED total so the toolbar count tracks the active
  // filters; falls back to the SSR-seeded total until the first client result.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const handleCountChange = useCallback((c: number) => setLiveCount(c), []);

  // Side-effect-free: the legacy controls below call `usePathname()`
  // themselves and route through `commitDirectoryListingUrl`, which now
  // auto-detects basePath from pathname (`/p/...` stays on that path).
  // We only reference `pathname` here to keep the dependency obvious.
  void pathname;

  return (
    <>
      {showTopBar && topBarFacet ? (
        <DirectoryTalentTypeBar
          options={topBarFacet.options}
          categoryTree={categoryTree}
          selectedIds={taxonomyTermIds}
          allLabel={ui.topBarPills.all}
          barAriaLabel={topBarFacet.label}
          overflowCopy={ui.topBarPills}
        />
      ) : null}
      {scopeLimitedHint ? (
        <p
          className="mt-3 rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[var(--impronta-muted)]"
          data-directory-scope-hint
        >
          {scopeLimitedHint}
        </p>
      ) : null}
      {aiSummary ? <AIInterpretChip summary={aiSummary} /> : null}
      <div className="mt-6 flex gap-8">
        {showSidebar && sidebarBlocks.length > 0 ? (
          // P4 — `order-last` floats the aside to the right when
          // `sidebarPosition==='right'`; sticky is gated on `sidebarSticky`.
          <aside
            className={`hidden w-56 shrink-0 md:block ${
              sidebarPosition === "right" ? "order-last" : ""
            }`}
            data-sidebar-position={sidebarPosition}
          >
            <div className={sidebarSticky ? "sticky top-20" : undefined}>
              <DirectoryFiltersSidebar
                blocks={sidebarBlocks}
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
          </aside>
        ) : null}

        <div
          className="min-w-0 flex-1"
          data-directory-density={density}
          data-directory-hover={hoverBehavior}
          style={cardKitOverrideStyle}
        >
          {showSidebar && sidebarBlocks.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 md:mb-0 md:hidden">
              <DirectoryMobileFilters
                blocks={sidebarBlocks}
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
          ) : null}

          {showActiveChips ? (
            <DirectoryActiveFilterChips
              taxonomyTermIds={taxonomyTermIds}
              query={query}
              locationSlug={locationSlug}
              heightMinCm={heightMinCm}
              heightMaxCm={heightMaxCm}
              ageMin={ageMin}
              ageMax={ageMax}
              fieldFacets={fieldFacets}
              labelById={labelById}
              fieldLabelByKey={fieldLabelByKey}
              ui={ui}
            />
          ) : null}

          {showSort || showResultCount ? (
            <DirectoryResultsToolbar
              totalCount={liveCount ?? initialPage.totalCount ?? 0}
              sort={sort}
              view={view}
              ui={ui}
              isFetching={isGridFetching}
            />
          ) : null}

          {view === "map" ? (
            <DirectoryMapView
              apiKey={mapApiKey ?? null}
              locale={locale}
              ui={ui}
              taxonomyTermIds={taxonomyTermIds}
              sort={sort}
              query={query}
              locationSlug={locationSlug}
              heightMinCm={heightMinCm}
              heightMaxCm={heightMaxCm}
              ageMin={ageMin}
              ageMax={ageMax}
              fieldFacets={fieldFacets}
              card={{
                cardStyle,
                cardAspect,
                show: {
                  showName,
                  showTalentType,
                  showLocation,
                  showAvailability,
                  showBadges,
                },
                showSave,
                showAddToInquiry,
                cardFieldKeys,
                maxFieldLines,
                nameFallback,
              }}
              columnsDesktop={columnsDesktop}
              columnsTablet={columnsTablet}
              columnsMobile={columnsMobile}
            />
          ) : (
            <DirectoryReactiveGrid
              taxonomyTermIds={taxonomyTermIds}
              initialPage={initialPage}
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
              ui={ui}
              directorySearchViaAi={aiSearchEnabled && query.trim().length > 0}
              manualProfileCodes={scope === "manual" ? manualProfileCodes : undefined}
              cardStyle={cardStyle}
              cardAspect={cardAspect}
              onFetchingChange={handleFetchingChange}
              onCountChange={handleCountChange}
              show={{
                showName,
                showTalentType,
                showLocation,
                showAvailability,
                showBadges,
              }}
              showSave={showSave}
              showAddToInquiry={showAddToInquiry}
              cardFieldKeys={cardFieldKeys}
              maxFieldLines={maxFieldLines}
              nameFallback={nameFallback}
              columnsDesktop={columnsDesktop}
              columnsTablet={columnsTablet}
              columnsMobile={columnsMobile}
            />
          )}
        </div>
      </div>
      {showAddToInquiry ? <DirectoryInquiryReviewBar ui={ui} /> : null}
    </>
  );
}
