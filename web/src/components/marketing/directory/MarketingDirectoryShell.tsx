"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { MarketingContainer } from "@/components/marketing/container";
import Link from "next/link";
import { loadMoreDirectoryTalents } from "@/app/(marketing)/global-directory/actions";
import {
  directoryPageHref,
  type DirectoryPageWindow,
} from "@/lib/directory/pagination";
import {
  FOCUS_RING,
  type DirectoryActiveFilters,
  type DirectoryCardRow,
  type DirectoryFacets,
  type DirectoryView,
  type DiscoverMapPoint,
  type DiscoverSort,
} from "./shared";
import { DirectorySearch } from "./DirectorySearch";
import { DirectoryTypeBar } from "./DirectoryTypeBar";
import { DirectoryFilters } from "./DirectoryFilters";
import { DirectoryToolbar } from "./DirectoryToolbar";
import { DirectoryTalentCard } from "./DirectoryTalentCard";
import { DirectoryTalentRow } from "./DirectoryTalentRow";
import { MarketingDirectoryMap } from "./MarketingDirectoryMap";

type Props = {
  view: DirectoryView;
  sort: DiscoverSort;
  facets: DirectoryFacets;
  activeFilters: DirectoryActiveFilters;
  // Grid / list data (first SSR page). Rows carry an optional per-agency
  // `design` (attached server-side by the page + the load-more action), so the
  // shape is `DirectoryCardRow` — not the raw bridge item — to keep that field
  // type-tracked end to end through the items state.
  initialItems: DirectoryCardRow[];
  initialTotal: number;
  pageSize: number;
  // Map data (only populated when view === "map").
  mapPoints: DiscoverMapPoint[];
  mapUnmappedCount: number;
  mapApiKey: string | null;
  /**
   * Addressable-page window for the current `?page=`. Server-computed so the
   * off-by-one lives in one tested place rather than in JSX.
   */
  pageWindow: DirectoryPageWindow;
};

export function MarketingDirectoryShell({
  view,
  sort,
  facets,
  activeFilters,
  initialItems,
  initialTotal,
  // pageSize is part of Props (caller passes it) but the shell now paginates
  // via the loadMoreDirectoryTalents server action, so it isn't read here.
  mapPoints,
  mapUnmappedCount,
  mapApiKey,
  pageWindow,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const reduceMotion = useReducedMotion();

  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);

  // Re-seed local list whenever the server hands back a fresh page (any
  // filter / sort / search navigation produces a new initialItems array).
  useEffect(() => {
    setItems(initialItems);
    setTotal(initialTotal);
  }, [initialItems, initialTotal]);

  // Mobile filter sheet as a real dialog: lock body scroll, move focus into
  // the sheet, trap Tab within it, Esc closes, and focus returns to whatever
  // opened it. (Closed-state tab-out is handled by `inert` on the wrapper.)
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const lastFocused = document.activeElement as HTMLElement | null;
    sheetCloseRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheetOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const root = sheetRef.current;
      if (!root) return;
      const nodes = root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      lastFocused?.focus();
    };
  }, [sheetOpen]);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const activeFilterCount =
    (activeFilters.country ? 1 : 0) +
    (activeFilters.city ? 1 : 0) +
    (activeFilters.trustTier ? 1 : 0) +
    (activeFilters.availableOnly ? 1 : 0);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const { items: more, total: freshTotal } = await loadMoreDirectoryTalents(
        { ...activeFilters, sort },
        // OFFSET IS ABSOLUTE, not "how many I am showing". On ?page=3 the grid
        // starts at row 48, so passing items.length alone would re-fetch page 1
        // and append duplicates under the page-3 heading.
        pageWindow.offset + items.length,
      );
      setItems((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...more.filter((t) => !seen.has(t.id))];
      });
      setTotal(freshTotal);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [activeFilters, sort, items.length, loadingMore]);

  const renderFilters = (variant: "rail" | "sheet") => (
    <DirectoryFilters
      variant={variant}
      facets={facets}
      active={activeFilters}
      onCountry={(v) => updateParams({ country: v, city: null })}
      onCity={(city, country) => updateParams({ city, country })}
      onAvailableOnly={(v) => updateParams({ avail: v ? "1" : null })}
      onTrust={(v) => updateParams({ trust: v })}
      onClearAll={() => updateParams({ country: null, city: null, avail: null, trust: null })}
    />
  );

  // Rows still unseen BELOW this page's starting offset.
  const hasMore = view !== "map" && pageWindow.offset + items.length < total;
  const showEmpty = view !== "map" && !isPending && items.length === 0;

  return (
    <MarketingContainer size="wide" className="pb-24">
      <div className="flex flex-col gap-5">
        <DirectorySearch value={activeFilters.q} onCommit={(v) => updateParams({ q: v })} />
        <DirectoryTypeBar
          categories={facets.categories}
          active={activeFilters.category}
          onSelect={(slug) => updateParams({ tax: slug })}
        />
      </div>

      <div className="mt-8 flex gap-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24">{renderFilters("rail")}</div>
        </aside>

        <div className="min-w-0 flex-1">
          <h2 className="sr-only">Directory results</h2>
          {/* Announce result-count / loading changes to screen readers. */}
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {isPending
              ? "Updating results…"
              : `${total.toLocaleString()} ${total === 1 ? "profile" : "profiles"}`}
          </p>
          <DirectoryToolbar
            total={total}
            view={view}
            sort={sort}
            activeFilterCount={activeFilterCount}
            onView={(v) => updateParams({ view: v === "grid" ? null : v })}
            onSort={(s) => updateParams({ sort: s === "recommended" ? null : s })}
            onOpenFilters={() => setSheetOpen(true)}
          />

          <div className="mt-6" aria-busy={isPending}>
            {view === "map" ? (
              <MarketingDirectoryMap
                points={mapPoints}
                apiKey={mapApiKey}
                unmappedCount={mapUnmappedCount}
                onBackToGrid={() => updateParams({ view: null })}
              />
            ) : isPending ? (
              <DirectorySkeleton view={view} />
            ) : showEmpty ? (
              <DirectoryEmpty
                hasFilters={activeFilterCount > 0 || !!activeFilters.q || !!activeFilters.category}
                onClear={() =>
                  updateParams({ country: null, city: null, avail: null, trust: null, tax: null, q: null })
                }
              />
            ) : view === "list" ? (
              <div className="flex flex-col gap-2.5">
                {items.map((t, i) => (
                  <Entrance key={t.id} index={i} reduce={!!reduceMotion}>
                    <DirectoryTalentRow talent={t} />
                  </Entrance>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
                {items.map((t, i) => (
                  <Entrance key={t.id} index={i} reduce={!!reduceMotion}>
                    <DirectoryTalentCard talent={t} />
                  </Entrance>
                ))}
              </div>
            )}

            {/* Addressable pages. Real <a href> links, so a slice can be
                refreshed, shared and reached with the back button — the thing
                "page 1 plus N presses of Show more" could never do. This is a
                UX affordance, NOT an SEO one: /global-directory canonicals to
                /directory, so nothing here reaches the index. The crawl gap was
                77 profiles advertised in no sitemap, fixed in #1814. */}
            {view !== "map" && pageWindow.totalPages > 1 ? (
              <nav
                className="mt-10 flex flex-wrap items-center justify-center gap-1.5"
                aria-label="Directory pages"
              >
                {pageWindow.prev ? (
                  <Link
                    href={directoryPageHref(pathname, searchParams, pageWindow.prev)}
                    rel="prev"
                    className="rounded-full px-3 py-2 text-[0.8125rem]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    Previous
                  </Link>
                ) : null}
                {pageWindow.pages.map((p, i) =>
                  p === null ? (
                    <span
                      key={`gap-${i}`}
                      aria-hidden
                      className="px-1 text-[0.8125rem]"
                      style={{ color: "var(--plt-muted)" }}
                    >
                      &hellip;
                    </span>
                  ) : (
                    <Link
                      key={p}
                      href={directoryPageHref(pathname, searchParams, p)}
                      aria-current={p === pageWindow.page ? "page" : undefined}
                      className="min-w-9 rounded-full px-3 py-2 text-center text-[0.8125rem]"
                      style={
                        p === pageWindow.page
                          ? { background: "var(--plt-ink)", color: "var(--plt-bg)" }
                          : { color: "var(--plt-ink)" }
                      }
                    >
                      {p}
                    </Link>
                  ),
                )}
                {pageWindow.next ? (
                  <Link
                    href={directoryPageHref(pathname, searchParams, pageWindow.next)}
                    rel="next"
                    className="rounded-full px-3 py-2 text-[0.8125rem]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    Next
                  </Link>
                ) : null}
              </nav>
            ) : null}

            {hasMore && !isPending ? (
              <div className="mt-10 flex flex-col items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className={`inline-flex h-12 items-center rounded-full px-7 text-[0.9375rem] font-medium transition-colors disabled:opacity-60 ${FOCUS_RING}`}
                  style={{
                    border: "1px solid var(--plt-hairline-strong)",
                    background: "var(--plt-bg-raised)",
                    color: "var(--plt-ink)",
                  }}
                >
                  {loadingMore ? "Loading…" : `Show more (${total - items.length} left)`}
                </button>
                {loadMoreError ? (
                  <p className="text-[0.8125rem]" style={{ color: "var(--plt-muted)" }} role="alert">
                    Couldn&apos;t load more. Tap to try again.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile filter sheet — same DirectoryFilters body as the desktop rail. */}
      <div
        ref={sheetRef}
        inert={!sheetOpen}
        className={`fixed inset-0 z-[60] lg:hidden ${sheetOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!sheetOpen}
      >
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{ background: "rgba(15,23,20,0.4)", opacity: sheetOpen ? 1 : 0 }}
          onClick={() => setSheetOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          className="absolute left-0 top-0 flex h-full w-[86%] max-w-sm flex-col transition-transform duration-300"
          style={{
            background: "var(--plt-bg)",
            borderRight: "1px solid var(--plt-hairline-strong)",
            transform: sheetOpen ? "translateX(0)" : "translateX(-100%)",
          }}
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: "1px solid var(--plt-hairline)" }}
          >
            <span className="plt-display text-[1.0625rem] font-semibold" style={{ color: "var(--plt-ink)" }}>
              Filters
            </span>
            <button
              ref={sheetCloseRef}
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="Close filters"
              className={`flex h-9 w-9 items-center justify-center rounded-full ${FOCUS_RING}`}
              style={{ border: "1px solid var(--plt-hairline-strong)", color: "var(--plt-ink)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto px-6 py-6">{renderFilters("sheet")}</div>
          <div className="px-6 py-4" style={{ borderTop: "1px solid var(--plt-hairline)" }}>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className={`inline-flex h-12 w-full items-center justify-center rounded-full text-[0.9375rem] font-semibold ${FOCUS_RING}`}
              style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}
            >
              Show {total.toLocaleString()} {total === 1 ? "profile" : "profiles"}
            </button>
          </div>
        </div>
      </div>
    </MarketingContainer>
  );
}

function Entrance({
  children,
  index,
  reduce,
}: {
  children: React.ReactNode;
  index: number;
  reduce: boolean;
}) {
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut", delay: Math.min(index, 10) * 0.03 }}
    >
      {children}
    </motion.div>
  );
}

function DirectorySkeleton({ view }: { view: DirectoryView }) {
  const count = 8;
  if (view === "list") {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-[18px] px-4 py-3"
            style={{ background: "var(--plt-bg-raised)", border: "1px solid var(--plt-hairline)" }}
          >
            <Shimmer className="h-14 w-14 rounded-[14px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Shimmer className="h-3.5 w-40 rounded-full" />
              <Shimmer className="h-3 w-28 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-[22px]"
          style={{ background: "var(--plt-bg-raised)", border: "1px solid var(--plt-hairline)" }}
        >
          <Shimmer className="aspect-[4/5] w-full" />
          <div className="flex flex-col gap-2 p-4">
            <Shimmer className="h-4 w-3/4 rounded-full" />
            <Shimmer className="h-3 w-1/2 rounded-full" />
            <Shimmer className="h-3 w-2/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse ${className ?? ""}`}
      style={{ background: "color-mix(in srgb, var(--plt-ink) 7%, var(--plt-bg-raised))" }}
    />
  );
}

function DirectoryEmpty({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-[22px] px-6 py-20 text-center"
      style={{ background: "var(--plt-bg-raised)", border: "1px dashed var(--plt-hairline-strong)" }}
    >
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--plt-forest) 9%, var(--plt-bg-raised))", color: "var(--plt-forest)" }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13.5 13.5L18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <h3 className="plt-display text-[1.25rem] font-semibold" style={{ color: "var(--plt-ink)" }}>
        No profiles match yet
      </h3>
      <p className="max-w-md text-[0.9375rem] leading-relaxed" style={{ color: "var(--plt-muted)" }}>
        {hasFilters
          ? "Try widening your filters. Fewer constraints surface more of the network."
          : "The directory is still filling in. Talent control their own visibility, so new profiles appear here as they opt in."}
      </p>
      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className={`mt-1 inline-flex h-11 items-center rounded-full px-6 text-[0.875rem] font-semibold ${FOCUS_RING}`}
          style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
