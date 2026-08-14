"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

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
import { DirectoryMapView } from "./DirectoryMapView";
import type { DirectoryCategoryParent } from "@/lib/directory/directory-category-tree";
import type { DirectoryV1 } from "./schema";
import { mapDirectoryDefaultSort } from "./default-sort";

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
  seedSignature,
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
  scopeTaxonomyTermIds,
  cardKitOverrideStyle,
  cardKitOverrideFamily,
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
  showAttributes,
  showSave,
  showAddToInquiry,
  showQuickView,
  showPriceFrom,
  cardClickAction,
  cardFieldKeys,
  maxFieldLines,
  nameFallback,
  columnsDesktop,
  columnsTablet,
  columnsMobile,
}: {
  /** Server-fetched first page (unfiltered for the section scope). */
  initialPage: DirectoryPageResponse;
  /** Signature of the request the SERVER seeded (see directorySeedSignature). */
  seedSignature: string;
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
   * The SECTION's own taxonomy scope (`scope="by_talent_type"`), already
   * resolved slugs → term UUIDs on the server. Must reach the client: the grid
   * rebuilds the seed signature from the ids it can see, so without this a
   * scoped section never matches its own SSR seed, throws the server rows
   * away, and refetches UNSCOPED — which is how a category page rendered an
   * empty grid while its facet bar showed counts.
   */
  scopeTaxonomyTermIds?: string[];
  /**
   * P4 — inline `--token-card-*` CSS vars from a resolved per-instance card
   * kit. Set on a wrapper around the grid so THIS instance's canonical cards
   * paint in the override palette regardless of the tenant default. Inline
   * vars only (publishPageSnapshot does not bake classes).
   */
  cardKitOverrideStyle?: CSSProperties;
  /** Family slug of the per-section kit override — pairs with data-card-design-scope on the results wrapper. */
  cardKitOverrideFamily?: string;
  /** Filter sidebar placement (`left`/`right`) — orders the aside via flex. */
  sidebarPosition: DirectoryV1["sidebarPosition"];
  /** Whether the desktop filter aside is sticky. */
  sidebarSticky: boolean;
  /** Section scope — drives the render-level manual-pick filter. */
  scope: DirectoryV1["scope"];
  /** Resolved manual profile codes (in pick order) when `scope=manual`. */
  manualProfileCodes: string[];
  density: NonNullable<DirectoryV1["density"]>;
  hoverBehavior: NonNullable<DirectoryV1["hoverBehavior"]>;
  // B3 — card-level config threaded through to the new reactive grid.
  cardStyle: NonNullable<DirectoryV1["cardStyle"]>;
  cardAspect: NonNullable<DirectoryV1["cardAspect"]>;
  showName: boolean;
  showTalentType: boolean;
  showLocation: boolean;
  showAvailability: boolean;
  showBadges: boolean;
  showAttributes: boolean;
  /** Render the per-card favorite (save) affordance. */
  showSave: boolean;
  /** Render the per-card "Inquire / Added" cart bar. */
  showAddToInquiry: boolean;
  /** Render the per-card quick-view (eye) media peek. */
  showQuickView: boolean;
  showPriceFrom: boolean;
  /** Card click → profile modal (default) or hard page navigation. */
  cardClickAction: DirectoryV1["cardClickAction"];
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
          seedSignature={seedSignature}
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
          scopeTaxonomyTermIds={scopeTaxonomyTermIds}
          cardKitOverrideStyle={cardKitOverrideStyle}
          cardKitOverrideFamily={cardKitOverrideFamily}
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
          showAttributes={showAttributes}
          showSave={showSave}
          showAddToInquiry={showAddToInquiry}
          showQuickView={showQuickView}
          showPriceFrom={showPriceFrom}
          cardClickAction={cardClickAction}
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

function DirectoryReactiveResultsInner({
  initialPage,
  seedSignature,
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
  scopeTaxonomyTermIds,
  cardKitOverrideStyle,
  cardKitOverrideFamily,
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
  showAttributes,
  showSave,
  showAddToInquiry,
  showQuickView,
  showPriceFrom,
  cardClickAction,
  cardFieldKeys,
  maxFieldLines,
  nameFallback,
  columnsDesktop,
  columnsTablet,
  columnsMobile,
}: {
  initialPage: DirectoryPageResponse;
  /** Signature of the request the SERVER seeded (see directorySeedSignature). */
  seedSignature: string;
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
  /** The section's own resolved taxonomy scope — see the outer prop doc. */
  scopeTaxonomyTermIds?: string[];
  cardKitOverrideStyle?: CSSProperties;
  /** Family slug of the per-section kit override — pairs with data-card-design-scope on the results wrapper. */
  cardKitOverrideFamily?: string;
  sidebarPosition: DirectoryV1["sidebarPosition"];
  sidebarSticky: boolean;
  scope: DirectoryV1["scope"];
  manualProfileCodes: string[];
  density: NonNullable<DirectoryV1["density"]>;
  hoverBehavior: NonNullable<DirectoryV1["hoverBehavior"]>;
  cardStyle: NonNullable<DirectoryV1["cardStyle"]>;
  cardAspect: NonNullable<DirectoryV1["cardAspect"]>;
  showName: boolean;
  showTalentType: boolean;
  showLocation: boolean;
  showAvailability: boolean;
  showBadges: boolean;
  showAttributes: boolean;
  showSave: boolean;
  showAddToInquiry: boolean;
  showQuickView: boolean;
  showPriceFrom: boolean;
  cardClickAction: DirectoryV1["cardClickAction"];
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

  // Mirrors the server's precedence (Component.tsx): a visitor's URL selection
  // wins; otherwise the section's own scope applies. Keeping these two in sync
  // is what makes the client's seed signature match the server's, so the SSR
  // rows are adopted instead of discarded + refetched.
  const urlTaxonomyTermIds = parseTaxonomyParam(record.tax);
  const taxonomyTermIds =
    urlTaxonomyTermIds.length > 0
      ? urlTaxonomyTermIds
      : (scopeTaxonomyTermIds ?? []);
  // Sort: prefer URL value; else section's defaultSort mapped onto engine.
  // `parseDirectorySort` only returns an engine-valid value, never section
  // values like `az` — so falling back to `mapDefaultSort` is safe.
  const sort: DirectorySortValue =
    sp.get("sort") &&
    DIRECTORY_SORT_VALUES.includes(sp.get("sort") as DirectorySortValue)
      ? parseDirectorySort(record.sort)
      : mapDirectoryDefaultSort(defaultSort);
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

  // App-like desktop filter panel: toggled from the toolbar, slides open and
  // closed. Defaults open (matches SSR); the visitor's last choice persists.
  const hasSidebar = showSidebar && sidebarBlocks.length > 0;
  const [filtersOpen, setFiltersOpen] = useState(true);
  // `animateFilters` stays false until the stored preference has been applied,
  // so a visitor who closed the panel doesn't watch it slide shut on every
  // navigation — it is simply already closed on first paint after hydration.
  const [animateFilters, setAnimateFilters] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem("directory:filters-open") === "0") {
        setFiltersOpen(false);
      }
    } catch {
      /* storage unavailable (private mode) — keep default */
    }
    setAnimateFilters(true);
  }, []);
  const toggleFilters = useCallback(() => {
    // The write lives outside the state updater: React StrictMode invokes
    // updaters twice, which would double-fire the storage side effect.
    setFiltersOpen((open) => !open);
  }, []);
  useEffect(() => {
    if (!animateFilters) return;
    try {
      window.localStorage.setItem("directory:filters-open", filtersOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [filtersOpen, animateFilters]);

  const activeFilterCount =
    taxonomyTermIds.length +
    (locationSlug ? 1 : 0) +
    (heightMinCm != null || heightMaxCm != null ? 1 : 0) +
    (ageMin != null || ageMax != null ? 1 : 0) +
    fieldFacets.reduce((n, f) => n + f.values.length, 0);

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
      <div className="mt-6 flex">
        {hasSidebar ? (
          // P4 — `order-last` floats the aside to the right when
          // `sidebarPosition==='right'`; sticky is gated on `sidebarSticky`.
          // The panel slides open/closed from the toolbar's Filters toggle;
          // the inner rail keeps a fixed width so content never squishes
          // mid-animation. The flex gap lives INSIDE the rail (pr/pl) so a
          // closed panel collapses to a clean 0.
          <motion.aside
            initial={false}
            animate={{
              width: filtersOpen ? 256 : 0,
              opacity: filtersOpen ? 1 : 0,
            }}
            transition={
              animateFilters
                ? { type: "spring", stiffness: 300, damping: 34, mass: 0.9 }
                : { duration: 0 }
            }
            className={`hidden shrink-0 overflow-hidden md:block ${
              sidebarPosition === "right" ? "order-last" : ""
            }`}
            data-sidebar-position={sidebarPosition}
            // `inert` (not just aria-hidden): a width-0 overflow-hidden panel
            // still keeps its inputs in the tab order, so keyboard users would
            // tab into controls that screen readers refuse to announce.
            inert={!filtersOpen}
          >
            <div
              className={`w-64 ${sidebarPosition === "right" ? "pl-8" : "pr-8"}`}
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
            </div>
          </motion.aside>
        ) : null}

        <div
          className="min-w-0 flex-1"
          data-directory-density={density}
          data-directory-hover={hoverBehavior}
          data-token-template-directory-card-family={cardKitOverrideFamily}
          data-card-design-scope={cardKitOverrideFamily ? "" : undefined}
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

          {/* The toolbar also hosts the view switcher and the Filters toggle,
              so it stays mounted even when both text knobs are off — those two
              knobs now gate only their own sub-controls. */}
          <DirectoryResultsToolbar
            totalCount={liveCount ?? initialPage.totalCount ?? 0}
            sort={sort}
            view={view}
            ui={ui}
            isFetching={isGridFetching}
            reviewsEnabled={initialPage.reviewsEnabled}
            filtersOpen={hasSidebar ? filtersOpen : undefined}
            onToggleFilters={hasSidebar ? toggleFilters : undefined}
            activeFilterCount={activeFilterCount}
            showSort={showSort}
            showResultCount={showResultCount}
          />

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
                  showAttributes,
                },
                showSave,
                showAddToInquiry,
                showQuickView,
                showPriceFrom,
                cardClickAction,
                cardFieldKeys,
                maxFieldLines,
                nameFallback,
                density,
                hoverBehavior,
              }}
              columnsMobile={columnsMobile}
              onCountChange={handleCountChange}
            />
          ) : (
            <DirectoryReactiveGrid
              taxonomyTermIds={taxonomyTermIds}
              initialPage={initialPage}
              seedSignature={seedSignature}
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
              density={density}
              hoverBehavior={hoverBehavior}
              onFetchingChange={handleFetchingChange}
              onCountChange={handleCountChange}
              show={{
                showName,
                showTalentType,
                showLocation,
                showAvailability,
                showBadges,
                showAttributes,
              }}
              showSave={showSave}
              showAddToInquiry={showAddToInquiry}
              showQuickView={showQuickView}
              showPriceFrom={showPriceFrom}
              cardClickAction={cardClickAction}
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
      {/* W2-E — the floating "OPEN INQUIRY · N" review bar was retired: it
          duplicated the dock pill (same count + faces), which is now the single
          floating inquiry entry. Adding talent still routes through the same
          shared cart; the dock is THE front door. */}
    </>
  );
}
