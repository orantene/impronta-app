/**
 * event_program — the pure half of the block: what the island renders once
 * `loadEventProgram` has answered. No React, no DOM, no server import, so it
 * unit-tests under `test:builder-node-bindings` and ships to the client
 * without dragging the sessions / ticket modules into the bundle.
 *
 * Rules (docs/plans/events-program/00-proposal.md §6, §7, §9):
 *   - `filterKinds` then `limit`, in that order, on the loader's already
 *     sorted list (starts_at, sort_order, TBA last).
 *   - `groupBy: auto` = night when the event has more than one night, else
 *     place when items span more than one space, else none.
 *   - Night = session, never the calendar date: an item at 01:30 sits under
 *     its Saturday and shows `+1` when its local date differs from the night's.
 *   - "Now" is CLIENT-ONLY: `nowMarkerIndex` takes the clock as an argument so
 *     the server render never computes it (no hydration mismatch).
 */

import type { PublicEventProgram, PublicScheduleItem } from "@/app/(public)/_events/event-program-actions";
import type { EventProgramGroupBy, EventProgramLayout } from "./types";

export type ProgramLocale = "en" | "es";
export type ReadyProgram = Extract<PublicEventProgram, { enabled: true }>;
export type GroupMode = "night" | "place" | "none";

export type PlacedItem = {
  item: PublicScheduleItem;
  /** `18:00` (es) / `1:30 am` (en); null when TBA, hidden, or no zone. */
  timeLabel: string | null;
  endTimeLabel: string | null;
  /** Whole days between the group's night and the item's local date; 0 when unknown. */
  dayOffset: number;
};

export type ProgramGroup = {
  key: string;
  label: string;
  items: PlacedItem[];
};

export const DEFAULT_LAYOUT: EventProgramLayout = "timeline";
export const DEFAULT_GROUP_BY: EventProgramGroupBy = "auto";

// ── Selection ──────────────────────────────────────────────────────────────

export function selectItems(
  items: ReadonlyArray<PublicScheduleItem>,
  options: { filterKinds?: ReadonlyArray<string> | null; limit?: number | null },
): PublicScheduleItem[] {
  const kinds = new Set((options.filterKinds ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean));
  const kept = kinds.size > 0 ? items.filter((i) => kinds.has(i.kind)) : [...items];
  const limit = options.limit;
  return typeof limit === "number" && Number.isFinite(limit) && limit >= 1 ? kept.slice(0, Math.trunc(limit)) : kept;
}

/** `auto` → night when >1 night, else place when >1 space among the items, else none. */
export function resolveGroupMode(
  groupBy: EventProgramGroupBy | undefined,
  program: Pick<ReadyProgram, "nights">,
  items: ReadonlyArray<PublicScheduleItem>,
): GroupMode {
  const mode = groupBy ?? DEFAULT_GROUP_BY;
  if (mode !== "auto") return mode;
  if (program.nights.length > 1) return "night";
  const spaces = new Set(items.map((i) => i.spaceId).filter((s): s is string => !!s));
  return spaces.size > 1 ? "place" : "none";
}

// ── Time labels (venue zone) ───────────────────────────────────────────────

const HMM = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local YYYY-MM-DD of an instant in `zone`; null when either is unusable. */
export function localDate(iso: string | null, zone: string | null): string | null {
  if (!iso || !zone) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    return HMM.test(parts) ? parts : null;
  } catch {
    return null;
  }
}

/** `18:00` in es; `1:30 am` in en. Same clock the tickets show. */
export function timeLabel(iso: string | null, zone: string | null, locale: ProgramLocale): string | null {
  if (!iso || !zone) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const label = new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
      timeZone: zone,
      hour: locale === "es" ? "2-digit" : "numeric",
      minute: "2-digit",
      hour12: locale !== "es",
    }).format(d);
    return label.replace(/\s?(AM|PM|a\.?\s?m\.?|p\.?\s?m\.?)$/i, (m) => ` ${m.trim().toLowerCase()}`);
  } catch {
    return null;
  }
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

function place(item: PublicScheduleItem, nightDate: string | null, zone: string | null, locale: ProgramLocale, showTimes: boolean): PlacedItem {
  const tba = item.timeTba || !item.startsAt;
  const itemDate = tba ? null : localDate(item.startsAt, zone);
  return {
    item,
    timeLabel: showTimes && !tba ? timeLabel(item.startsAt, zone, locale) : null,
    endTimeLabel: showTimes && !tba && item.endsAt ? timeLabel(item.endsAt, zone, locale) : null,
    dayOffset: nightDate && itemDate ? dayDiff(nightDate, itemDate) : 0,
  };
}

// ── Grouping ───────────────────────────────────────────────────────────────

export const GENERAL_KEY = "general";
export const UNPLACED_KEY = "unplaced";

export function buildGroups(
  program: Pick<ReadyProgram, "nights" | "spaces" | "zone">,
  items: ReadonlyArray<PublicScheduleItem>,
  mode: GroupMode,
  locale: ProgramLocale,
  showTimes: boolean,
): ProgramGroup[] {
  const zone = program.zone;
  if (mode === "night") {
    const nightById = new Map(program.nights.map((n) => [n.sessionId, n]));
    const buckets = new Map<string, PublicScheduleItem[]>();
    for (const item of items) {
      const key = item.sessionId && nightById.has(item.sessionId) ? item.sessionId : GENERAL_KEY;
      buckets.set(key, [...(buckets.get(key) ?? []), item]);
    }
    const out: ProgramGroup[] = [];
    const general = buckets.get(GENERAL_KEY);
    if (general?.length) out.push({ key: GENERAL_KEY, label: "General", items: general.map((i) => place(i, null, zone, locale, showTimes)) });
    for (const night of program.nights) {
      const list = buckets.get(night.sessionId);
      if (!list?.length) continue;
      const nightDate = localDate(night.startsAt, zone);
      out.push({ key: night.sessionId, label: night.label, items: list.map((i) => place(i, nightDate, zone, locale, showTimes)) });
    }
    return out;
  }
  if (mode === "place") {
    const spaceById = new Map(program.spaces.map((s) => [s.id, s]));
    const buckets = new Map<string, PublicScheduleItem[]>();
    for (const item of items) {
      const key = item.spaceId && spaceById.has(item.spaceId) ? item.spaceId : UNPLACED_KEY;
      buckets.set(key, [...(buckets.get(key) ?? []), item]);
    }
    const out: ProgramGroup[] = [];
    for (const space of program.spaces) {
      const list = buckets.get(space.id);
      if (!list?.length) continue;
      out.push({ key: space.id, label: space.name, items: list.map((i) => place(i, null, zone, locale, showTimes)) });
    }
    const unplaced = buckets.get(UNPLACED_KEY);
    if (unplaced?.length) out.push({ key: UNPLACED_KEY, label: locale === "es" ? "Sin lugar" : "No place", items: unplaced.map((i) => place(i, null, zone, locale, showTimes)) });
    return out;
  }
  // none: one group; its night date (when the event has exactly one night)
  // still drives the `+1` marker.
  const nightDate = program.nights.length === 1 ? localDate(program.nights[0]!.startsAt, zone) : null;
  return [{ key: "all", label: "", items: items.map((i) => place(i, nightDate, zone, locale, showTimes)) }];
}

// ── "Now" (client-only) ────────────────────────────────────────────────────

const NEXT_START_FALLBACK_MS = 3 * 60 * 60 * 1000;

/**
 * The index of the item running at `nowMs`, or -1. An item runs from its
 * start to its end, or to the next timed item's start, or (last item, no end)
 * for three hours. TBA items never run. Pure so the island can call it after
 * mount only; the server never sees a clock.
 */
export function nowMarkerIndex(placed: ReadonlyArray<PlacedItem>, nowMs: number): number {
  const starts = placed.map((p) => (p.item.timeTba || !p.item.startsAt ? null : Date.parse(p.item.startsAt)));
  for (let i = 0; i < placed.length; i += 1) {
    const start = starts[i];
    if (start === null || Number.isNaN(start) || start > nowMs) continue;
    let end: number | null = placed[i]!.item.endsAt ? Date.parse(placed[i]!.item.endsAt as string) : null;
    if (end === null || Number.isNaN(end)) {
      const next = starts.slice(i + 1).find((s): s is number => s !== null && !Number.isNaN(s) && s > start);
      end = next ?? start + NEXT_START_FALLBACK_MS;
    }
    if (nowMs < end) return i;
  }
  return -1;
}

/** The program heading in the reader's locale: block override, else the program's own. */
export function programHeading(override: string | undefined, program: Pick<ReadyProgram, "heading">): string {
  const o = (override ?? "").trim();
  return o.length > 0 ? o : program.heading;
}
