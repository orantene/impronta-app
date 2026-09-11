/**
 * The Overview's shape (Main board, WS005): five numbers, one queue sorted by
 * consequence, one Today panel, one readiness bar.
 *
 * PURE. No runtime imports, no clock, no client. `snapshot.ts` reads the
 * engine and calls `buildNeedsYou` / `todayRows`; the board renders what comes
 * back. Every sentence a person reads is either the engine's own words (an
 * exception's title) or a message KEY with parameters, resolved on the client
 * in the viewer's language — nothing here is English that a Spanish or French
 * workspace would have to read.
 */

import type { DestinationId } from "@/lib/workspace/destinations";

/** A sentence: the engine's own text, or a message key with its parameters. */
export type OverviewCopy =
  | { readonly text: string }
  | { readonly key: string; readonly params?: Readonly<Record<string, string | number>> };

export type OverviewMoney = {
  /** False when a money reader failed: the card then says so instead of 0. */
  readonly ok: boolean;
  readonly currency: string;
  readonly collectedTodayCents: number;
  readonly cashCents: number;
  readonly cardCents: number;
  readonly otherCents: number;
  readonly owedCents: number;
  readonly owedCount: number;
  readonly owedDueTodayCount: number;
};

export type OverviewArrivals = {
  readonly ok: boolean;
  readonly expected: number;
  readonly arrived: number;
  readonly inService: number;
  readonly late: number;
};

export type OverviewOrders = {
  readonly ok: boolean;
  readonly open: number;
  readonly inPreparation: number;
  readonly ready: number;
};

export type OverviewExceptions = {
  readonly ok: boolean;
  readonly total: number;
  readonly uncertainPayments: number;
  readonly unavailable: readonly string[];
};

export type NeedsYouTone = "critical" | "high" | "normal" | "info";

export type NeedsYouRow = {
  readonly key: string;
  readonly tone: NeedsYouTone;
  readonly title: OverviewCopy;
  readonly detail: OverviewCopy;
  /** The destination chip: where this row lives. */
  readonly destination: DestinationId;
  /** The one action. A `null` href is a row a person has to look at first. */
  readonly action: { readonly label: OverviewCopy; readonly href: string | null };
  /** Lower first. Consequence, then age. */
  readonly rank: number;
  readonly at: string;
};

export type TodayBadge = {
  readonly key:
    | "arrived"
    | "inService"
    | "waiting"
    | "confirmed"
    | "depositPaid"
    | "late"
    | "booked"
    | "noShow"
    | "completed"
    | "full"
    | "seatsLeft"
    | "waitlisted"
    | "free"
    | "held"
    | "occupied"
    | "unconfirmed";
  readonly count?: number;
  readonly tone: "green" | "indigo" | "slate" | "coral" | "critical";
};

export type TodayRow = {
  readonly id: string;
  /** HH:MM on the venue's clock; empty for a table with no time. */
  readonly time: string;
  readonly title: string;
  readonly sub: OverviewCopy;
  readonly badges: readonly TodayBadge[];
  readonly href: string | null;
};

export type OverviewToday = {
  readonly arrivals: readonly TodayRow[];
  readonly classes: readonly TodayRow[];
  readonly tables: readonly TodayRow[];
  /** Which tabs this workspace has a reader for at all. */
  readonly tabs: readonly ("arrivals" | "classes" | "tables")[];
};

export type SetupItemKey =
  | "timeZone"
  | "catalogItem"
  | "whoPerforms"
  | "bookableHours"
  | "onlinePayments"
  | "bookingPolicy"
  | "payoutDestination"
  | "websitePublished";

export type SetupItem = {
  readonly key: SetupItemKey;
  readonly done: boolean;
  /** The fact when done (a timezone, an item and its price), the consequence when not. */
  readonly detail: OverviewCopy;
};

export type OverviewSnapshot = {
  readonly timeZone: string;
  readonly ymd: string;
  readonly nowIso: string;
  readonly money: OverviewMoney;
  readonly arrivals: OverviewArrivals;
  readonly orders: OverviewOrders;
  readonly exceptions: OverviewExceptions;
  readonly needsYou: readonly NeedsYouRow[];
  readonly today: OverviewToday;
  readonly setup: readonly SetupItem[];
};

/** Consequence ranks. Money that is uncertain outranks money that is merely owed. */
export const NEEDS_YOU_RANK = {
  critical: 0,
  high: 1,
  balanceDueToday: 2,
  unconfirmedToday: 2,
  normal: 3,
  lateArrival: 3,
  info: 4,
} as const;

export function sortNeedsYou(rows: readonly NeedsYouRow[]): NeedsYouRow[] {
  return [...rows].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const at = Date.parse(a.at);
    const bt = Date.parse(b.at);
    if (!Number.isFinite(at)) return Number.isFinite(bt) ? 1 : 0;
    if (!Number.isFinite(bt)) return -1;
    return at - bt;
  });
}

/** How many of the readiness items are done, for "7 of 9". */
export function setupProgress(items: readonly SetupItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/** "N things need you": the queue's length. */
export function needsYouCount(snapshot: Pick<OverviewSnapshot, "needsYou">): number {
  return snapshot.needsYou.length;
}
