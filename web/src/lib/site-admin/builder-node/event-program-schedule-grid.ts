/**
 * event_program `schedule` layout — the pure grid maths.
 *
 * A night with several stages becomes a grid: one column per space (a single
 * column when the event has none), one row per 30-minute slot from the
 * earliest timed item to the latest end, and one block per item spanning its
 * duration (its end, else the next item's start in the same column, else one
 * slot). TBA items cannot be placed and are returned apart so the island can
 * list them under the grid. Pure: no DOM, no clock.
 */

import { timeLabel, type PlacedItem, type ProgramLocale } from "./event-program-model";

export const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60_000;

export type ScheduleColumn = { key: string; label: string };

export type ScheduleBlock = {
  placed: PlacedItem;
  /** 0-based column index into `columns`. */
  column: number;
  /** 1-based CSS grid row (row 1 is the first slot). */
  rowStart: number;
  rowSpan: number;
};

export type ScheduleGrid = {
  columns: ScheduleColumn[];
  /** One label per slot row, in the venue zone. */
  slotLabels: string[];
  blocks: ScheduleBlock[];
  /** Items with no usable start: listed, never placed. */
  unplaced: PlacedItem[];
};

export const SCHEDULE_ALL_KEY = "all";
export const SCHEDULE_NO_PLACE_KEY = "no-place";

function startMs(p: PlacedItem): number | null {
  if (p.item.timeTba || !p.item.startsAt) return null;
  const t = Date.parse(p.item.startsAt);
  return Number.isNaN(t) ? null : t;
}

function endMs(p: PlacedItem): number | null {
  if (!p.item.endsAt) return null;
  const t = Date.parse(p.item.endsAt);
  return Number.isNaN(t) ? null : t;
}

export function buildScheduleGrid(
  placed: ReadonlyArray<PlacedItem>,
  spaces: ReadonlyArray<{ id: string; name: string }>,
  zone: string | null,
  locale: ProgramLocale,
): ScheduleGrid {
  const timed = placed.filter((p) => startMs(p) !== null);
  const unplaced = placed.filter((p) => startMs(p) === null);

  // Columns: the event's spaces in their order, then a trailing column for
  // timed items without a space, or one "all" column when there are no spaces.
  const spaceIndex = new Map(spaces.map((s, i) => [s.id, i]));
  const columns: ScheduleColumn[] = spaces.map((s) => ({ key: s.id, label: s.name }));
  const needsLoose = timed.some((p) => !p.item.spaceId || !spaceIndex.has(p.item.spaceId));
  if (columns.length === 0) columns.push({ key: SCHEDULE_ALL_KEY, label: "" });
  else if (needsLoose) columns.push({ key: SCHEDULE_NO_PLACE_KEY, label: locale === "es" ? "Sin lugar" : "No place" });
  const columnOf = (p: PlacedItem): number => {
    if (spaces.length === 0) return 0;
    const idx = p.item.spaceId ? spaceIndex.get(p.item.spaceId) : undefined;
    return idx ?? columns.length - 1;
  };

  if (timed.length === 0) return { columns, slotLabels: [], blocks: [], unplaced };

  const starts = timed.map((p) => startMs(p) as number);
  const first = Math.floor(Math.min(...starts) / SLOT_MS) * SLOT_MS;

  // Each block's end: its own end, else the next start in its column, else one slot.
  const byColumn = new Map<number, number[]>();
  timed.forEach((p, i) => {
    const c = columnOf(p);
    byColumn.set(c, [...(byColumn.get(c) ?? []), starts[i]!]);
  });
  const blocks: ScheduleBlock[] = timed.map((p, i) => {
    const start = starts[i]!;
    const column = columnOf(p);
    let end = endMs(p);
    if (end === null || end <= start) {
      const next = (byColumn.get(column) ?? []).filter((s) => s > start).sort((a, b) => a - b)[0];
      end = next ?? start + SLOT_MS;
    }
    const rowStart = Math.floor((start - first) / SLOT_MS) + 1;
    const rowEnd = Math.ceil((end - first) / SLOT_MS) + 1;
    return { placed: p, column, rowStart, rowSpan: Math.max(1, rowEnd - rowStart) };
  });

  const rows = Math.max(...blocks.map((b) => b.rowStart + b.rowSpan - 1));
  const slotLabels: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    slotLabels.push(timeLabel(new Date(first + r * SLOT_MS).toISOString(), zone, locale) ?? "");
  }
  return { columns, slotLabels, blocks, unplaced };
}
