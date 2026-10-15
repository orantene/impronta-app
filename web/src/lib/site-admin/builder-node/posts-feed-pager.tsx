"use client";

/**
 * posts-feed-pager.tsx: the `posts_feed` pagination island (Posts v1, PO1).
 *
 * The server already rendered every page (capped by POSTS_FEED_MAX_PAGES) and
 * hid the cards after the first page. This island only reveals them:
 *   load_more → each click shows the next page;
 *   numbered  → page links (`?page=N` on the hosting page). A click swaps the
 *               visible page and updates the URL in place; a shared `?page=N`
 *               link opens on that page.
 * No data fetch, no library.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

export type PostsFeedPagerLabels = {
  loadMore: string;
  pagination: string;
  page: string;
  previous: string;
  next: string;
};

export const POSTS_FEED_PAGE_PARAM = "page";

function items(root: HTMLElement | null): HTMLElement[] {
  const section = root?.closest("[data-builder-node-kind='posts_feed']");
  return section ? Array.from(section.querySelectorAll<HTMLElement>("[data-post-index]")) : [];
}

function revealRange(root: HTMLElement | null, from: number, to: number) {
  for (const el of items(root)) {
    const i = Number(el.dataset.postIndex);
    el.hidden = !(i >= from && i < to);
  }
}

export function PostsFeedPager({
  mode,
  pageCount,
  perPage,
  labels,
}: {
  mode: "load_more" | "numbered";
  pageCount: number;
  perPage: number;
  labels: PostsFeedPagerLabels;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(1); // load_more: pages visible
  const [page, setPage] = useState(1); // numbered: current page

  const showRange = useCallback((from: number, to: number) => {
    revealRange(ref.current, from, to);
  }, []);

  useEffect(() => {
    if (mode !== "numbered") return;
    const raw = Number(new URLSearchParams(window.location.search).get(POSTS_FEED_PAGE_PARAM));
    const start = Number.isFinite(raw) && raw >= 1 ? Math.min(pageCount, Math.trunc(raw)) : 1;
    if (start !== 1) {
      setPage(start);
      showRange((start - 1) * perPage, start * perPage);
    }
  }, [mode, pageCount, perPage, showRange]);

  if (mode === "load_more") {
    if (shown >= pageCount) return null;
    return (
      <div ref={ref} className="sb-pf-pager">
        <button
          type="button"
          onClick={() => {
            const next = shown + 1;
            setShown(next);
            showRange(0, next * perPage);
          }}
        >
          {labels.loadMore}
        </button>
      </div>
    );
  }

  const go = (e: MouseEvent<HTMLAnchorElement>, n: number) => {
    e.preventDefault();
    setPage(n);
    showRange((n - 1) * perPage, n * perPage);
    const url = new URL(window.location.href);
    if (n === 1) url.searchParams.delete(POSTS_FEED_PAGE_PARAM);
    else url.searchParams.set(POSTS_FEED_PAGE_PARAM, String(n));
    window.history.replaceState(window.history.state, "", url.toString());
    ref.current?.closest("[data-builder-node-kind='posts_feed']")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <div ref={ref}>
      <nav className="sb-pf-pager" aria-label={labels.pagination}>
        {page > 1 ? (
          <a href={`?${POSTS_FEED_PAGE_PARAM}=${page - 1}`} onClick={(e) => go(e, page - 1)} rel="prev">
            {labels.previous}
          </a>
        ) : null}
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <a
            key={n}
            href={`?${POSTS_FEED_PAGE_PARAM}=${n}`}
            onClick={(e) => go(e, n)}
            aria-current={n === page ? "page" : undefined}
            aria-label={`${labels.page} ${n}`}
          >
            {n}
          </a>
        ))}
        {page < pageCount ? (
          <a href={`?${POSTS_FEED_PAGE_PARAM}=${page + 1}`} onClick={(e) => go(e, page + 1)} rel="next">
            {labels.next}
          </a>
        ) : null}
      </nav>
    </div>
  );
}
