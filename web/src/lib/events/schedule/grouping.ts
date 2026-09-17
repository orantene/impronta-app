/**
 * grouping.ts — how a flat list of schedule items becomes a program.
 *
 * Pure (no IO). The rules are the proposal's §6:
 *
 *   - Instants in, venue-zone labels out. Nothing here reads the server clock.
 *   - GROUP BY THE NIGHT = SESSION, never by calendar date. An item at 01:30
 *     on Sunday belongs to Saturday's night and shows `1:30 am` with `+1`.
 *   - Items with no session (or a session the caller did not pass) form a
 *     leading "general" group.
 *   - Order inside a group: `starts_at`, then `sort_order`, TBA last.
 *   - Overlaps are WARNINGS: same space, `[start, end ?? next start)` crossing.
 *
 * The formatters are the ones tickets already use (`public-event-time`,
 * `ticket-page-model`), so a program and a ticket never disagree on a clock.
 */

import { localDateIn } from "@/lib/sessions/recurrence";

import { whenLabel, type EventLabelLocale } from "../public-event-time";
import { clockLabel } from "../ticket-page-model";
import type { ScheduleItem } from "./model";

// ── Inputs ─────────────────────────────────────────────────────────────────

/** The slice of a `sessions` row the grouper needs. */
export type ScheduleSessionRef = {
  id: string;
  /** ISO instant. */
  startsAt: string;
  endsAt?: string | null;
  title?: string | null;
  status?: string | null;
};

/** The slice of a `spaces` row the grouper needs. */
export type ScheduleSpaceRef = {
  id: string;
  name: string;
  kind?: string | null;
  sortOrder?: number | null;
};

export type GroupingOptions = {
  locale?: EventLabelLocale;
};

// ── Outputs ────────────────────────────────────────────────────────────────

export type PlacedScheduleItem = {
  item: ScheduleItem;
  /** `18:00` (es) / `1:30 am` (en); null when TBA or the zone is unusable. */
  timeLabel: string | null;
  /** Same shape for the end; null when open-ended, TBA, or no zone. */
  endTimeLabel: string | null;
  /**
   * Whole days between the night's local date and the item's local date.
   * 0 for the same date, +1 when the item crosses midnight, negative if a
   * row starts before its night's date (a data error the UI should show, not
   * hide). 0 when either date is unknown.
   */
  dayOffset: number;
};

export type NightGroup = {
  /** `general` for items with no session, else the session id. */
  key: string;
  sessionId: string | null;
  session: ScheduleSessionRef | null;
  /** Local YYYY-MM-DD of the session start in the venue zone; null for general / no zone. */
  nightDate: string | null;
  /** "sábado, 21 de noviembre" (es) / "Saturday, November 21" (en); "General" for the leading group. */
  label: string;
  items: PlacedScheduleItem[];
};

export type SpaceGroup = {
  /** `unplaced` for items with no space, else the space id. */
  key: string;
  spaceId: string | null;
  space: ScheduleSpaceRef | null;
  label: string;
  items: PlacedScheduleItem[];
};

export type ScheduleOverlap = {
  spaceId: string;
  a: ScheduleItem;
  b: ScheduleItem;
};

export const GENERAL_GROUP_KEY = "general";
export const UNPLACED_GROUP_KEY = "unplaced";

// ── Ordering ───────────────────────────────────────────────────────────────

/** The four fields the order is decided on; a `ScheduleItem` carries them as is, a raw row under its column names. */
type ScheduleOrderKey = { startsAt: string | null; timeTba: boolean; sortOrder: number; title: string };

/** The same four fields as the `event_schedule_items` columns name them. */
export type ScheduleRowOrderKey = { starts_at: string | null; time_tba: boolean; sort_order: number; title: string };

function startMs(item: ScheduleOrderKey): number | null {
  if (item.timeTba || !item.startsAt) return null;
  const t = Date.parse(item.startsAt);
  return Number.isNaN(t) ? null : t;
}

function compareOrderKeys(a: ScheduleOrderKey, b: ScheduleOrderKey): number {
  const sa = startMs(a);
  const sb = startMs(b);
  if (sa !== null && sb !== null && sa !== sb) return sa - sb;
  if (sa === null && sb !== null) return 1;
  if (sa !== null && sb === null) return -1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.title.localeCompare(b.title);
}

/**
 * `starts_at`, then `sort_order`, TBA last (TBA among themselves by
 * `sort_order`, then title so the order is stable across renders).
 */
export function compareScheduleItems(a: ScheduleItem, b: ScheduleItem): number {
  return compareOrderKeys(a, b);
}

export function sortScheduleItems(items: ReadonlyArray<ScheduleItem>): ScheduleItem[] {
  return [...items].sort(compareScheduleItems);
}

function rowOrderKey(row: ScheduleRowOrderKey): ScheduleOrderKey {
  return { startsAt: row.starts_at, timeTba: row.time_tba, sortOrder: row.sort_order, title: row.title };
}

/** The same order as `sortScheduleItems`, applied to raw rows: the staff list and the public list agree. */
export function sortScheduleRows<T extends ScheduleRowOrderKey>(rows: ReadonlyArray<T>): T[] {
  return [...rows].sort((a, b) => compareOrderKeys(rowOrderKey(a), rowOrderKey(b)));
}

// ── Labels ─────────────────────────────────────────────────────────────────

/** `18:00` in es; `1:30 am` in en (the ticket clock, with the period lowered). */
export function scheduleTimeLabel(iso: string | null, zone: string | null, locale: EventLabelLocale = "es"): string | null {
  if (!iso || !zone) return null;
  const label = clockLabel(iso, zone, locale);
  if (!label) return null;
  return label.replace(/\s?(AM|PM|a\.?\s?m\.?|p\.?\s?m\.?)$/i, (m) => ` ${m.trim().toLowerCase()}`);
}

function localDate(iso: string | null, zone: string | null): string | null {
  if (!iso || !zone) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return localDateIn(d, zone);
}

/** Civil-day difference between two YYYY-MM-DD strings (b - a). */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86_400_000);
}

function place(item: ScheduleItem, nightDate: string | null, zone: string | null, locale: EventLabelLocale): PlacedScheduleItem {
  const tba = item.timeTba || !item.startsAt;
  const itemDate = tba ? null : localDate(item.startsAt, zone);
  return {
    item,
    timeLabel: tba ? null : scheduleTimeLabel(item.startsAt, zone, locale),
    endTimeLabel: tba || !item.endsAt ? null : scheduleTimeLabel(item.endsAt, zone, locale),
    dayOffset: nightDate && itemDate ? dayDiff(nightDate, itemDate) : 0,
  };
}

function nightLabel(session: ScheduleSessionRef, zone: string | null, locale: EventLabelLocale): string {
  return whenLabel(session.startsAt, zone, locale, false);
}

// ── groupItemsByNight ──────────────────────────────────────────────────────

/**
 * Items → one group per session (ordered by session start), preceded by a
 * "general" group when any item has no session (or a session not in
 * `sessions`). Single-night events still get their one group; the caller
 * decides whether to show its header. Empty sessions produce no group.
 */
export function groupItemsByNight(
  items: ReadonlyArray<ScheduleItem>,
  sessions: ReadonlyArray<ScheduleSessionRef>,
  zone: string | null,
  options: GroupingOptions = {},
): NightGroup[] {
  const locale = options.locale ?? "es";
  const byId = new Map<string, ScheduleSessionRef>();
  for (const s of sessions) byId.set(s.id, s);

  const buckets = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const key = item.sessionId && byId.has(item.sessionId) ? item.sessionId : GENERAL_GROUP_KEY;
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  const out: NightGroup[] = [];
  const general = buckets.get(GENERAL_GROUP_KEY);
  if (general && general.length > 0) {
    out.push({
      key: GENERAL_GROUP_KEY,
      sessionId: null,
      session: null,
      nightDate: null,
      label: "General",
      items: sortScheduleItems(general).map((i) => place(i, null, zone, locale)),
    });
  }

  const ordered = [...sessions].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (const session of ordered) {
    const list = buckets.get(session.id);
    if (!list || list.length === 0) continue;
    const nightDate = localDate(session.startsAt, zone);
    out.push({
      key: session.id,
      sessionId: session.id,
      session,
      nightDate,
      label: nightLabel(session, zone, locale),
      items: sortScheduleItems(list).map((i) => place(i, nightDate, zone, locale)),
    });
  }
  return out;
}

// ── groupItemsBySpace ──────────────────────────────────────────────────────

/**
 * Items → one group per space (spaces in their own `sortOrder`, then name),
 * followed by an "unplaced" group for items with no space or a space not in
 * `spaces`. `dayOffset` is 0 everywhere here: a stage column has no night to
 * be relative to; callers wanting `+1` compose with `groupItemsByNight`.
 */
export function groupItemsBySpace(
  items: ReadonlyArray<ScheduleItem>,
  spaces: ReadonlyArray<ScheduleSpaceRef>,
  zone: string | null = null,
  options: GroupingOptions = {},
): SpaceGroup[] {
  const locale = options.locale ?? "es";
  const byId = new Map<string, ScheduleSpaceRef>();
  for (const s of spaces) byId.set(s.id, s);

  const buckets = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const key = item.spaceId && byId.has(item.spaceId) ? item.spaceId : UNPLACED_GROUP_KEY;
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  const ordered = [...spaces].sort((a, b) => {
    const sa = a.sortOrder ?? 0;
    const sb = b.sortOrder ?? 0;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });

  const out: SpaceGroup[] = [];
  for (const space of ordered) {
    const list = buckets.get(space.id);
    if (!list || list.length === 0) continue;
    out.push({
      key: space.id,
      spaceId: space.id,
      space,
      label: space.name,
      items: sortScheduleItems(list).map((i) => place(i, null, zone, locale)),
    });
  }
  const unplaced = buckets.get(UNPLACED_GROUP_KEY);
  if (unplaced && unplaced.length > 0) {
    out.push({
      key: UNPLACED_GROUP_KEY,
      spaceId: null,
      space: null,
      label: locale === "es" ? "Sin lugar" : "No place",
      items: sortScheduleItems(unplaced).map((i) => place(i, null, zone, locale)),
    });
  }
  return out;
}

// ── detectOverlaps ─────────────────────────────────────────────────────────

/**
 * Pairs of items in the SAME space whose `[starts_at, ends_at ?? nextStart)`
 * intervals cross. `nextStart` is the earliest start strictly after the item's
 * own start among items in that space; an open-ended item with nothing after
 * it runs to the end of the night, so two open-ended items starting together
 * DO overlap. TBA items and items with no space never overlap anything.
 *
 * Warnings, not errors: the schema permits every one of these on purpose.
 */
export function detectOverlaps(items: ReadonlyArray<ScheduleItem>): ScheduleOverlap[] {
  const bySpace = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    if (!item.spaceId || startMs(item) === null) continue;
    const list = bySpace.get(item.spaceId) ?? [];
    list.push(item);
    bySpace.set(item.spaceId, list);
  }

  const out: ScheduleOverlap[] = [];
  for (const [spaceId, list] of bySpace) {
    const sorted = [...list].sort(compareScheduleItems);
    const starts = sorted.map((i) => startMs(i) as number);
    const ends = sorted.map((item, idx) => {
      if (item.endsAt) {
        const e = Date.parse(item.endsAt);
        if (!Number.isNaN(e) && e > starts[idx]) return e;
      }
      const next = starts.find((s) => s > starts[idx]);
      return next ?? Number.POSITIVE_INFINITY;
    });
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        // Sorted by start, so starts[j] >= starts[i]; they cross iff j starts before i ends.
        if (starts[j] < ends[i]) out.push({ spaceId, a: sorted[i], b: sorted[j] });
      }
    }
  }
  return out;
}
