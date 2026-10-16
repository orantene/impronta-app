"use client";

/**
 * posts-feed-pager.tsx: the `posts_feed` load-more island (Posts v1, PO1).
 *
 * The server already rendered every page (capped by POSTS_FEED_MAX_PAGES) and
 * hid the cards after the first page. Each click reveals the next page.
 * No data fetch, no library.
 */
import { useRef, useState } from "react";

export type PostsFeedPagerLabels = {
  loadMore: string;
};

function items(root: HTMLElement | null): HTMLElement[] {
  const section = root?.closest("[data-builder-node-kind='posts_feed']");
  return section ? Array.from(section.querySelectorAll<HTMLElement>("[data-post-index]")) : [];
}

export function PostsFeedPager({
  pageCount,
  perPage,
  labels,
}: {
  pageCount: number;
  perPage: number;
  labels: PostsFeedPagerLabels;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(1); // pages visible

  if (shown >= pageCount) return null;
  return (
    <div ref={ref} className="sb-pf-pager">
      <button
        type="button"
        onClick={() => {
          const next = shown + 1;
          setShown(next);
          for (const el of items(ref.current)) el.hidden = !(Number(el.dataset.postIndex) < next * perPage);
        }}
      >
        {labels.loadMore}
      </button>
    </div>
  );
}
