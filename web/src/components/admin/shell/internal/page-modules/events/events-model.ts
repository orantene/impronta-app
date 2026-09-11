/**
 * events-model.ts — the judgements the Events boards (W16, EventDetail,
 * W17, W18, CreateEvent) draw, made once here and tested, so the list, the
 * detail's header and the event-day readiness say the same thing about one
 * row.
 *
 * Pure. Reads only what `loadWorkspaceEvents` returned. What the engine does
 * not record is said as an absence (`null`), never guessed.
 */

import type { EventListRow, EventTierRow, SessionPoolRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";

export type EventSegment = "upcoming" | "today" | "drafts" | "attention" | "past";
export const EVENT_SEGMENTS: readonly EventSegment[] = ["upcoming", "today", "drafts", "attention", "past"];

export function segmentFromQuery(raw: string | null): EventSegment {
  return EVENT_SEGMENTS.find((s) => s === raw) ?? "upcoming";
}

export type DetailTab = "overview" | "schedule" | "tickets" | "venue" | "orders" | "guests" | "day" | "page" | "money" | "settings";
export const DETAIL_TABS: readonly DetailTab[] = ["overview", "schedule", "tickets", "venue", "orders", "guests", "day", "page", "money", "settings"];

export function tabFromQuery(raw: string | null): DetailTab {
  return DETAIL_TABS.find((t) => t === raw) ?? "tickets";
}

/** The venue's calendar day of an instant, "2026-09-11", or null when the zone is unusable. */
export function dayKey(iso: string, zone: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return null;
  }
}

/**
 * The state column (W16): a published event with a night ahead is on sale; a
 * published event with nothing scheduled or no tier NEEDS ATTENTION and says
 * which; a finished run is past. A draft is a draft, a cancelled event is
 * cancelled, whatever its nights.
 */
export type EventState = "draft" | "salesOpen" | "noNight" | "noTier" | "finished" | "cancelled";

export function eventState(row: Pick<EventListRow, "status" | "sessionCount" | "tiers" | "runFinished">): EventState {
  if (row.status === "cancelled") return "cancelled";
  if (row.status === "draft") return "draft";
  if (row.tiers.length === 0) return "noTier";
  if (row.sessionCount === 0) return "noNight";
  if (row.runFinished) return "finished";
  return "salesOpen";
}

export function eventNeedsAttention(row: Pick<EventListRow, "status" | "sessionCount" | "tiers" | "runFinished">): boolean {
  const s = eventState(row);
  return s === "noNight" || s === "noTier";
}

/** Which segment a row files under, by the venue's calendar. */
export function inSegment(row: EventListRow, segment: EventSegment, nowIso: string): boolean {
  const state = eventState(row);
  switch (segment) {
    case "drafts":
      return state === "draft";
    case "attention":
      return eventNeedsAttention(row);
    case "past":
      return state === "finished" || state === "cancelled";
    case "today": {
      const today = dayKey(nowIso, row.timeZone);
      return today !== null && row.status === "published" && row.sessions.some((s) => dayKey(s.startsAt, row.timeZone) === today);
    }
    default:
      return state === "salesOpen" || state === "noNight" || state === "noTier";
  }
}

export function segmentCounts(rows: readonly EventListRow[], nowIso: string): Record<EventSegment, number> {
  const counts: Record<EventSegment, number> = { upcoming: 0, today: 0, drafts: 0, attention: 0, past: 0 };
  for (const row of rows) for (const seg of EVENT_SEGMENTS) if (inSegment(row, seg, nowIso)) counts[seg] += 1;
  return counts;
}

/** The tier's phase column: on sale, scheduled, hidden (sold by link) or ended. */
export type TierPhase = "onSale" | "scheduled" | "hidden" | "ended";

export function tierPhase(tier: Pick<EventTierRow, "onSale" | "saleReason">): TierPhase {
  if (tier.onSale) return "onSale";
  if (tier.saleReason === "scheduled") return "scheduled";
  if (tier.saleReason === "hidden") return "hidden";
  return "ended";
}

/** The four figures over the ticket table, from one night's pools. Null where no pool answers. */
export type NightFigures = {
  capacity: number | null;
  sold: number | null;
  remaining: number | null;
  /** Pools that exist for this night, over the tiers that could have one. */
  pooled: number;
  tiers: number;
};

export function nightFigures(pools: readonly SessionPoolRow[]): NightFigures {
  const withPool = pools.filter((p) => p.poolId !== null);
  if (withPool.length === 0) return { capacity: null, sold: null, remaining: null, pooled: 0, tiers: pools.length };
  let capacity = 0;
  let sold = 0;
  let soldKnown = true;
  for (const p of withPool) {
    capacity += (p.unitsTotal ?? 0) + (p.overbookUnits ?? 0);
    if (p.committedPeak === null) soldKnown = false;
    else sold += p.committedPeak;
  }
  return {
    capacity,
    sold: soldKnown ? sold : null,
    remaining: soldKnown ? Math.max(0, capacity - sold) : null,
    pooled: withPool.length,
    tiers: pools.length,
  };
}

/** W18's readiness strip: what the engine can vouch for tonight. */
export type Readiness = { key: "tiers" | "night" | "pools" | "published"; ok: boolean; value: string };

export function eventDayReadiness(row: EventListRow, pools: readonly SessionPoolRow[] | null): Readiness[] {
  const pooled = pools ? pools.filter((p) => p.poolId !== null).length : 0;
  return [
    { key: "published", ok: row.status === "published", value: row.status },
    { key: "tiers", ok: row.tiers.length > 0, value: String(row.tiers.length) },
    { key: "night", ok: row.sessionCount > 0, value: String(row.sessionCount) },
    { key: "pools", ok: pools !== null && pooled > 0 && pooled === pools.length, value: pools ? `${pooled} / ${pools.length}` : "0" },
  ];
}

/** The price typed on a form, "12,50" or "12.50", as cents; null when it is not a number. */
export function centsFromInput(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
