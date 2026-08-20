"use client";

import { LayoutGrid, List, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { DirectorySortValue } from "@/lib/directory/types";
import type { DirectoryViewMode } from "@/lib/directory/search-params";
import { cn } from "@/lib/utils";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import { DirectorySort } from "./directory-sort";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { formatResultsCount } from "@/lib/directory/directory-ui-copy";

export function DirectoryResultsToolbar({
  totalCount,
  sort,
  view,
  ui,
  isFetching = false,
  reviewsEnabled,
  filtersOpen,
  onToggleFilters,
  activeFilterCount = 0,
  showSort = true,
  showResultCount = true,
}: {
  totalCount: number;
  sort: DirectorySortValue;
  view: DirectoryViewMode;
  ui: DirectoryUiCopy;
  isFetching?: boolean;
  /** Desktop filter-panel toggle (undefined = no panel on this surface). */
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
  /** Number of active filter facets — shown as a badge on the toggle. */
  activeFilterCount?: number;
  /** Section knobs: hide the sort control / the result count individually. */
  showSort?: boolean;
  showResultCount?: boolean;
  /**
   * Tenant reviews entitlement (DirectoryPageResponse.reviewsEnabled). When
   * explicitly false the "Top rated" sort option is hidden — rating can never
   * affect order on a non-entitled surface. Absent = enabled (platform host).
   */
  reviewsEnabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setView = useCallback(
    (next: DirectoryViewMode) => {
      startTransition(() => {
        commitDirectoryListingUrl(router, pathname, searchParams.toString(), (params) => {
          if (next === "grid") params.delete("view");
          else params.set("view", next);
        });
      });
    },
    [router, pathname, searchParams, startTransition],
  );

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          {onToggleFilters ? (
            <button
              type="button"
              onClick={onToggleFilters}
              aria-pressed={filtersOpen}
              aria-expanded={filtersOpen}
              className={cn(
                "hidden items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors md:inline-flex",
                filtersOpen
                  ? "border-[var(--dir-accent-line)] bg-[var(--dir-accent-soft)] text-[var(--dir-accent)]"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="size-4" />
              <span>{filtersOpen ? ui.toolbar.filtersHide : ui.toolbar.filtersShow}</span>
              {activeFilterCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--dir-accent)] px-1.5 text-[11px] font-bold tabular-nums text-black">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          ) : null}
          {showResultCount ? (
            <span
              className={cn(
                "text-sm tabular-nums transition-opacity duration-150",
                isFetching ? "opacity-60" : "",
                "text-muted-foreground",
              )}
              aria-live="polite"
              aria-label={isFetching ? "Updating result count…" : undefined}
            >
              {formatResultsCount(ui, totalCount)}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-end gap-2",
            pending && "pointer-events-none opacity-60",
          )}
        >
          <div
            className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
            role="group"
            aria-label={ui.toolbar.resultLayoutAria}
          >
            <button
              type="button"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={cn(
                "rounded-md p-2 transition-colors min-h-10 min-w-10 inline-flex items-center justify-center sm:min-h-0 sm:min-w-0",
                view === "grid"
                  ? "bg-[var(--dir-accent-soft)] text-[var(--dir-accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label={ui.toolbar.gridViewAria}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={cn(
                "rounded-md p-2 transition-colors min-h-10 min-w-10 inline-flex items-center justify-center sm:min-h-0 sm:min-w-0",
                view === "list"
                  ? "bg-[var(--dir-accent-soft)] text-[var(--dir-accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label={ui.toolbar.listViewAria}
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              aria-pressed={view === "map"}
              onClick={() => setView("map")}
              className={cn(
                "rounded-md p-2 transition-colors min-h-10 min-w-10 inline-flex items-center justify-center sm:min-h-0 sm:min-w-0",
                view === "map"
                  ? "bg-[var(--dir-accent-soft)] text-[var(--dir-accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label={ui.toolbar.mapViewAria}
            >
              <MapIcon className="size-4" />
            </button>
          </div>
          {showSort ? (
            <DirectorySort
              current={sort}
              className="min-w-[10.5rem]"
              sortCopy={ui.sort}
              showTopRated={reviewsEnabled !== false}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
