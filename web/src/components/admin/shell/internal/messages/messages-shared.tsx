"use client";

import React, { useRef, useEffect } from "react";
import { MY_TALENT_PROFILE, COLORS } from "../state";


/**
 * Derive the current talent's stable id from their profile. The offer
 * mocks key talent rows by `t-<firstname>` — the talent shell needs to
 * match against the same id rather than hard-coding "t-marta", so swapping
 * `MY_TALENT_PROFILE` in the mocks would still produce the right pov.
 */
export const currentTalentId = () =>
  `t-${MY_TALENT_PROFILE.name.split(" ")[0]?.toLowerCase()}`;
export type MessagesPov = "admin" | "talent" | "client";

// ════════════════════════════════════════════════════════════════════
// SHARED — adapters + common helpers
// ════════════════════════════════════════════════════════════════════

export const stageStyle = (stage: string): { bg: string; fg: string } => {
  switch (stage) {
    case "inquiry":  return { bg: `${COLORS.coral}18`,   fg: COLORS.coral };
    case "hold":
    case "offered": return { bg: `${COLORS.amber}18`,   fg: COLORS.amber };
    case "booked":   return { bg: COLORS.successSoft,    fg: COLORS.success };
    default:         return { bg: "rgba(11,11,13,0.06)", fg: COLORS.inkMuted };
  }
};

export const ageLabel = (hrs: number) =>
  hrs < 1 ? "now" : hrs < 24 ? `${Math.floor(hrs)}h` : `${Math.floor(hrs / 24)}d`;

// Active-row scroll-into-view. Pass the active flag; returns a ref to
// attach to the row's outer button. Only triggers when the row is NOT
// already visible in its scroll container — clicking a row that's
// already on screen must not scroll (jarring + unexpected). Useful
// path: deep-linking to an inquiry that's far down the list, or
// arrow-key navigation through a long inbox.
export function useScrollIntoViewWhenActive(active: boolean) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    // Find the nearest scrollable ancestor — for the inbox that's the
    // overflow:auto list pane. Compare bounding rects: if the row's
    // top and bottom both fall inside the container's visible band,
    // it's already in view and we should not scroll.
    const isFullyVisible = (() => {
      let parent: HTMLElement | null = el.parentElement;
      while (parent) {
        const overflowY = getComputedStyle(parent).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") break;
        parent = parent.parentElement;
      }
      if (!parent) return true; // no scroll container → assume in view
      const elRect = el.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      return elRect.top >= parentRect.top && elRect.bottom <= parentRect.bottom;
    })();
    if (isFullyVisible) return;
    const r = requestAnimationFrame(() => {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(r);
  }, [active]);
  return ref;
}

// Bucket a row into a temporal group ("Today" / "Yesterday" / "This
// week" / "Older"). Used to render group headers in the inbox so the
// eye can scan the chronology without doing math on every age label.
export function dateGroupKey(hrs: number): "today" | "yesterday" | "week" | "older" {
  if (hrs < 24) return "today";
  if (hrs < 48) return "yesterday";
  if (hrs < 24 * 7) return "week";
  return "older";
}
export const DATE_GROUP_LABEL: Record<ReturnType<typeof dateGroupKey>, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  older: "Older",
};

// Render group headers above clusters of rows that share a date bucket.
// Pass an array, a getter that returns ageHrs for each item, and a row
// renderer; returns an interleaved list of headers + rows. Eats no
// height when an item's bucket matches the previous one.
export function renderWithDateGroups<T>(
  items: T[],
  getAgeHrs: (item: T) => number,
  renderRow: (item: T) => React.ReactNode,
): React.ReactNode {
  const out: React.ReactNode[] = [];
  let lastBucket: ReturnType<typeof dateGroupKey> | null = null;
  // Track how many times each bucket has appeared so duplicate
  // headers (e.g. when a custom sort puts a "today" item below a
  // "yesterday" one) get unique keys instead of collapsing.
  const bucketSeen: Record<string, number> = {};
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const b = dateGroupKey(getAgeHrs(item));
    if (b !== lastBucket) {
      bucketSeen[b] = (bucketSeen[b] ?? 0) + 1;
      const headerKey = bucketSeen[b] === 1 ? `hdr-${b}` : `hdr-${b}-${i}`;
      out.push(
        <div key={headerKey} data-tulala-inbox-group-header style={{
          padding: "10px 14px 4px",
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase", color: COLORS.inkMuted,
          background: "#fff",
          position: "sticky", top: 0, zIndex: 1,
          borderBottom: `1px solid ${COLORS.borderSoft}`,
        }}>
          {DATE_GROUP_LABEL[b]}
        </div>,
      );
      lastBucket = b;
    }
    out.push(renderRow(item));
  }
  return out;
}
