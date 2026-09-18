/**
 * now-marker.ts — which items of a run of show are in progress RIGHT NOW.
 *
 * Pure (no IO, no clock): the caller passes `nowMs`, read on the client after
 * mount so the server never renders an "Ahora" it cannot know. Instants
 * compare as instants, so the venue zone plays no part here; it only shapes
 * the labels the grouper already produced.
 *
 * An item runs from `starts_at` to:
 *   1. its own `ends_at`, when it has one; else
 *   2. the next timed item's start in the same list (proposal §4, "hasta el
 *      siguiente"), when there is one strictly later; else
 *   3. `OPEN_ENDED_WINDOW_MS` after its start, so the last item of the night
 *      stops being "now" once it is plainly over.
 *
 * TBA items are never "now". Parallel items (same start, two stages) are all
 * "now" together, which is the truth on the floor.
 */

import type { PlacedScheduleItem } from "./grouping";

/** How long the last open-ended item of a list counts as in progress. */
export const OPEN_ENDED_WINDOW_MS = 2 * 60 * 60 * 1000;

function startMs(p: PlacedScheduleItem): number | null {
  if (p.item.timeTba || !p.item.startsAt) return null;
  const t = Date.parse(p.item.startsAt);
  return Number.isNaN(t) ? null : t;
}

/** `[start, end)` of every timed item, in list order; TBA items are skipped. */
export function itemWindows(items: ReadonlyArray<PlacedScheduleItem>): Array<{ id: string; start: number; end: number }> {
  const timed = items
    .map((p) => ({ id: p.item.id, start: startMs(p), endsAt: p.item.endsAt }))
    .filter((x): x is { id: string; start: number; endsAt: string | null } => x.start !== null);
  const starts = timed.map((x) => x.start).sort((a, b) => a - b);
  return timed.map((x) => {
    let end: number | null = null;
    if (x.endsAt) {
      const e = Date.parse(x.endsAt);
      if (!Number.isNaN(e) && e > x.start) end = e;
    }
    if (end === null) {
      const next = starts.find((s) => s > x.start);
      end = next ?? x.start + OPEN_ENDED_WINDOW_MS;
    }
    return { id: x.id, start: x.start, end };
  });
}

/** Ids of the items whose window contains `nowMs`. Empty when nothing is on. */
export function nowItemIds(items: ReadonlyArray<PlacedScheduleItem>, nowMs: number): string[] {
  if (!Number.isFinite(nowMs)) return [];
  return itemWindows(items)
    .filter((w) => w.start <= nowMs && nowMs < w.end)
    .map((w) => w.id);
}
