"use client";

import { LayoutGrid, List, Map as MapIcon } from "lucide-react";
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
}: {
  totalCount: number;
  sort: DirectorySortValue;
  view: DirectoryViewMode;
  ui: DirectoryUiCopy;
  isFetching?: boolean;
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
          <span
            className={cn(
              "text-sm tabular-nums transition-opacity duration-150",
              isFetching ? "text-white/30" : "text-white/70",
            )}
            aria-live="polite"
            aria-label={isFetching ? "Updating result count…" : undefined}
          >
            {formatResultsCount(ui, totalCount)}
          </span>
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-end gap-2",
            pending && "pointer-events-none opacity-60",
          )}
        >
          <div
            className="inline-flex rounded-lg border border-white/15 bg-white/[0.04] p-0.5"
            role="group"
            aria-label={ui.toolbar.resultLayoutAria}
          >
            <button
              type="button"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={cn(
                "rounded-md p-2 transition-colors",
                view === "grid"
                  ? "bg-[var(--dir-accent-soft)] text-[var(--impronta-gold-bright)]"
                  : "text-white/60 hover:text-zinc-200",
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
                "rounded-md p-2 transition-colors",
                view === "list"
                  ? "bg-[var(--dir-accent-soft)] text-[var(--impronta-gold-bright)]"
                  : "text-white/60 hover:text-zinc-200",
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
                "rounded-md p-2 transition-colors",
                view === "map"
                  ? "bg-[var(--dir-accent-soft)] text-[var(--impronta-gold-bright)]"
                  : "text-white/60 hover:text-zinc-200",
              )}
              aria-label={ui.toolbar.mapViewAria}
            >
              <MapIcon className="size-4" />
            </button>
          </div>
          <DirectorySort current={sort} className="min-w-[10.5rem]" sortCopy={ui.sort} />
        </div>
      </div>
    </div>
  );
}
