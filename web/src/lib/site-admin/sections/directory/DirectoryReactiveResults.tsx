"use client";

import { Suspense, useMemo } from "react";
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
import { DirectoryInfiniteGrid } from "@/components/directory/directory-infinite";
import { DirectoryTalentTypeBar } from "@/components/directory/directory-talent-type-bar";
import { DirectoryResultsToolbar } from "@/components/directory/directory-results-toolbar";
import { DirectoryFiltersSidebar } from "@/components/directory/directory-filters-sidebar";
import { DirectoryMobileFilters } from "@/components/directory/directory-mobile-filters";
import { DirectoryQueryProvider } from "@/components/directory/query-provider";

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
 * P1 Option B — Client island that makes the portable Directory section
 * reactive. Reads the live URL via `useSearchParams()`, parses with the
 * pure (server+client safe) helpers from `lib/directory/search-params`,
 * and mounts the legacy `DirectoryInfiniteGrid` against the public
 * `/api/directory` endpoint. Filter controls (talent-type pill bar,
 * desktop sidebar, mobile filters, results toolbar) are the existing
 * legacy components — they already `usePathname() + useSearchParams() +
 * commitDirectoryListingUrl`, so the path-aware `clientDirectoryHref`
 * keeps every navigation on the section's own URL.
 *
 * Per the research doc (Option B), the SSR seed is unfiltered: the
 * client reconciles to URL filters on mount via the grid's
 * `initialDataUpdatedAt: 0` mechanism. A *filtered* SSR seed would
 * require Option A's prop threading (recorded as a Phase-2b limitation).
 *
 * The card visual layer (premium DirectoryCard) is currently handled by
 * the legacy `talent-card.tsx` inside `DirectoryInfiniteGrid`. The §10
 * trust/agency/availability badges remain deferred to Phase B #3 (Lane 5)
 * when the public anonymous Discover listing endpoint lands.
 */
export function DirectoryReactiveResults({
  initialPage,
  locale,
  ui,
  topBarFacet,
  sidebarBlocks,
  defaultSort,
  showTopBar,
  showSidebar,
  showSort,
  showResultCount,
  showActiveChips: _showActiveChips,
  aiSearchEnabled = false,
  scopeLimitedHint,
  density,
  hoverBehavior,
}: {
  /** Server-fetched first page (unfiltered for the section scope). */
  initialPage: DirectoryPageResponse;
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
  density: DirectoryV1["density"];
  hoverBehavior: DirectoryV1["hoverBehavior"];
}) {
  return (
    <DirectoryQueryProvider>
      <Suspense fallback={null}>
        <DirectoryReactiveResultsInner
          initialPage={initialPage}
          locale={locale}
          ui={ui}
          topBarFacet={topBarFacet}
          sidebarBlocks={sidebarBlocks}
          defaultSort={defaultSort}
          showTopBar={showTopBar}
          showSidebar={showSidebar}
          showSort={showSort}
          showResultCount={showResultCount}
          aiSearchEnabled={aiSearchEnabled}
          scopeLimitedHint={scopeLimitedHint}
          density={density}
          hoverBehavior={hoverBehavior}
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
  locale,
  ui,
  topBarFacet,
  sidebarBlocks,
  defaultSort,
  showTopBar,
  showSidebar,
  showSort,
  showResultCount,
  aiSearchEnabled,
  scopeLimitedHint,
  density,
  hoverBehavior,
}: {
  initialPage: DirectoryPageResponse;
  locale: "en" | "es";
  ui: DirectoryUiCopy;
  topBarFacet?: DirectoryTopBarFacetPropShape;
  sidebarBlocks: DirectoryFilterSidebarBlock[];
  defaultSort: DirectoryV1["defaultSort"];
  showTopBar: boolean;
  showSidebar: boolean;
  showSort: boolean;
  showResultCount: boolean;
  aiSearchEnabled: boolean;
  scopeLimitedHint?: string;
  density: DirectoryV1["density"];
  hoverBehavior: DirectoryV1["hoverBehavior"];
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
  const view = parseDirectoryView(record);
  const fieldFacets: DirectoryFieldFacetSelection[] = parseDirectoryFieldFacets(
    record.ff,
  );

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
          selectedIds={taxonomyTermIds}
          allLabel={ui.topBarPills.all}
          barAriaLabel={topBarFacet.label}
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
      <div className="mt-6 flex gap-8">
        {showSidebar && sidebarBlocks.length > 0 ? (
          <aside className="hidden w-56 shrink-0 md:block">
            <div className="sticky top-20">
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

          {showSort || showResultCount ? (
            <DirectoryResultsToolbar
              totalCount={initialPage.totalCount ?? 0}
              sort={sort}
              view={view}
              ui={ui}
            />
          ) : null}

          <DirectoryInfiniteGrid
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
            directorySearchViaAi={aiSearchEnabled}
          />
        </div>
      </div>
    </>
  );
}
