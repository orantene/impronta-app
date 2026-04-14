"use client";

import { LayoutGrid, List } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { DirectorySortValue } from "@/lib/directory/types";
import type { DirectoryViewMode } from "@/lib/directory/search-params";
import { cn } from "@/lib/utils";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import { DirectorySort } from "./directory-sort";
import type { TaxonomyFilterOption } from "@/lib/directory/taxonomy-filters";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { formatResultsCount } from "@/lib/directory/directory-ui-copy";

export function DirectoryResultsToolbar({
  totalCount,
  sort,
  view,
  ui,
}: {
  totalCount: number;
  sort: DirectorySortValue;
  view: DirectoryViewMode;
  ui: DirectoryUiCopy;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setView = useCallback(
    (next: DirectoryViewMode) => {
      startTransition(() => {
        commitDirectoryListingUrl(router, pathname, searchParams.toString(), (params) => {
          if (next === "list") params.set("view", "list");
          else params.delete("view");
        });
      });
    },
    [router, pathname, searchParams, startTransition],
  );

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm tabular-nums text-[var(--impronta-muted)]">
            {formatResultsCount(ui, totalCount)}
          </span>
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-end gap-2",
            pending && "opacity-60",
          )}
        >
          <div
            className="inline-flex rounded-lg border border-[var(--impronta-gold-border)]/50 bg-[var(--impronta-surface)]/80 p-0.5"
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
                  ? "bg-[var(--impronta-gold)]/20 text-[var(--impronta-gold)]"
                  : "text-[var(--impronta-muted)] hover:text-zinc-200",
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
                  ? "bg-[var(--impronta-gold)]/20 text-[var(--impronta-gold)]"
                  : "text-[var(--impronta-muted)] hover:text-zinc-200",
              )}
              aria-label={ui.toolbar.listViewAria}
            >
              <List className="size-4" />
            </button>
          </div>
          <DirectorySort current={sort} className="min-w-[10.5rem]" sortCopy={ui.sort} />
        </div>
      </div>
    </div>
  );
}
