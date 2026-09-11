/**
 * floor-model.ts — the pure half of the floor board.
 *
 * Everything the board decides that is not a pixel: which tone a tile takes,
 * how the tables group into rooms, what the headline counts, which parties
 * sit in the Arriving / Waiting / Seated lists, where a block sits on the
 * timeline. No React, no clock read: `nowMs` is always passed in, from the
 * server's own read at render, so the server's markup and the first paint
 * agree and a test can pin the instant.
 */

import type { FloorTable } from "@/lib/visits/floor";

export type FloorBookState =
  | "booked"
  | "arriving"
  | "late"
  | "part_seated"
  | "seated"
  | "no_show"
  | "completed";

/** One row of tonight's book, as the host stand reads it (`lib/reservations/book.ts`). */
export type FloorBookEntry = {
  readonly admissionId: string;
  readonly startsAtIso: string;
  readonly partySize: number;
  readonly holderName: string | null;
  /** The table it is placed on, or null while the host has not placed it. */
  readonly spaceCode: string | null;
  readonly state: FloorBookState;
  readonly lateMinutes: number;
  /** When the party was checked in, or null while it has not been. */
  readonly seatedAtIso: string | null;
};

export type FloorTicket = {
  readonly status: "queued" | "acknowledged" | "ready";
  readonly revision: number;
};

/** The one tone a tile, a row and a pill agree on for a table. */
export type FloorTone = "free" | "arriving" | "held" | "seated" | "over" | "reset" | "blocked";

export function tableTone(table: FloorTable): FloorTone {
  if (table.blocked && table.state !== "occupied") return "blocked";
  if (table.state === "occupied") return table.overdue ? "over" : "seated";
  if (table.state === "held") return table.held?.late ? "held" : "arriving";
  if (table.needsResetSinceIso) return "reset";
  return "free";
}

export function tableCode(table: Pick<FloorTable, "code" | "name">): string {
  return table.code ?? table.name;
}

/** `T03+T04` for the primary half of a joined pair; the code alone otherwise. */
export function tableLabel(table: FloorTable, all: readonly FloorTable[]): string {
  const own = tableCode(table);
  if (!table.joinedWithSpaceId) return own;
  const other = all.find((t) => t.spaceId === table.joinedWithSpaceId);
  return other ? `${own}+${tableCode(other)}` : own;
}

/**
 * The headline figures, from the same rows the tiles render.
 *
 * "Seated" counts SEATINGS, not occupied spaces: two tables pushed together
 * are one party, so the joined half (`joinedFromSpaceId`) is not counted
 * again. "Total" is every table the venue can seat tonight, so a blocked one
 * is out. "Arriving" is the held tables; "Reset" the vacated ones.
 */
export function floorSummary(tables: readonly FloorTable[]): {
  seated: number;
  total: number;
  arriving: number;
  reset: number;
} {
  let seated = 0;
  let arriving = 0;
  let reset = 0;
  let total = 0;
  for (const t of tables) {
    if (!t.blocked) total += 1;
    if (t.state === "occupied" && !t.joinedFromSpaceId) seated += 1;
    if (t.state === "held") arriving += 1;
    if (t.state !== "occupied" && t.needsResetSinceIso) reset += 1;
  }
  return { seated, total, arriving, reset };
}

export type FloorGroup = { readonly id: string; readonly label: string; readonly tables: FloorTable[] };

/**
 * Tables grouped the way the floor plan reads: by the room or area they hang
 * off, else by what they are (booths together, tables together). The joined
 * half of a pair is folded into its primary and not drawn twice.
 */
export function groupTables(
  tables: readonly FloorTable[],
  labels: { tables: string; booths: string; cabanas: string },
): FloorGroup[] {
  const groups = new Map<string, FloorGroup>();
  for (const t of tables) {
    if (t.joinedFromSpaceId) continue;
    const id = t.parentId ?? `kind:${t.kind}`;
    const label =
      t.parentName ??
      (t.kind === "booth" ? labels.booths : t.kind === "cabana" ? labels.cabanas : labels.tables);
    const g = groups.get(id) ?? { id, label, tables: [] };
    g.tables.push(t);
    groups.set(id, g);
  }
  return [...groups.values()];
}

export function bookName(entry: Pick<FloorBookEntry, "holderName">, walkIn: string): string {
  return entry.holderName ?? walkIn;
}

/**
 * Every party booked for tonight that has not sat down yet, earliest first:
 * the board's Arrivals list carries the waiting walk-ins too, pilled
 * `Waiting`, so a host reads one list top to bottom.
 */
export function arrivingEntries(book: readonly FloorBookEntry[]): FloorBookEntry[] {
  return book
    .filter((e) => e.state === "booked" || e.state === "arriving" || e.state === "late")
    .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));
}

/**
 * A party that is due NOW and has no table: a walk-in the host put on the
 * list (an admission with no space at the next seating), or a booking whose
 * time has come with nobody having placed it yet. A booking further out
 * without a table is arriving, not waiting.
 */
export function isWaiting(entry: FloorBookEntry): boolean {
  return entry.spaceCode === null && (entry.state === "arriving" || entry.state === "late");
}

export function waitingEntries(book: readonly FloorBookEntry[]): FloorBookEntry[] {
  return book.filter((e) => isWaiting(e)).sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));
}

/** The seated parties: every primary occupied table, longest-seated first. */
export function seatedTables(tables: readonly FloorTable[]): FloorTable[] {
  return tables
    .filter((t) => t.state === "occupied" && !t.joinedFromSpaceId)
    .sort((a, b) => (b.elapsedMinutes ?? 0) - (a.elapsedMinutes ?? 0));
}

/**
 * The booking sitting at this table NOW, when the book knows one.
 *
 * Tonight's book keeps an earlier party that sat at this table and left
 * (its state stays `seated`; a closed visit does not complete the
 * admission), so a match is only a party checked in AT OR AFTER this
 * visit opened. A walk-in seated straight from the floor has no booking
 * and matches nothing, which is right.
 */
export function seatedEntryFor(table: FloorTable, book: readonly FloorBookEntry[]): FloorBookEntry | null {
  const code = tableCode(table);
  const openedMs = table.openedAtIso ? Date.parse(table.openedAtIso) : null;
  const candidates = book.filter((e) => {
    if (e.spaceCode !== code || (e.state !== "seated" && e.state !== "part_seated")) return false;
    if (openedMs == null || !e.seatedAtIso) return true;
    // A minute of slack: the check-in is written right after the visit opens.
    return Date.parse(e.seatedAtIso) >= openedMs - 60_000;
  });
  candidates.sort((a, b) => Date.parse(b.seatedAtIso ?? b.startsAtIso) - Date.parse(a.seatedAtIso ?? a.startsAtIso));
  return candidates[0] ?? null;
}

/** The next booking placed on this table after now, when there is one. */
export function nextBookingFor(
  table: FloorTable,
  book: readonly FloorBookEntry[],
  nowMs: number,
): FloorBookEntry | null {
  const code = tableCode(table);
  const upcoming = book
    .filter(
      (e) =>
        e.spaceCode === code &&
        (e.state === "booked" || e.state === "arriving") &&
        Date.parse(e.startsAtIso) > nowMs,
    )
    .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));
  return upcoming[0] ?? null;
}

/** Whether a party of `n` fits this table alone. */
export function fits(table: Pick<FloorTable, "partyMin" | "partyMax">, n: number): boolean {
  return n >= table.partyMin && n <= table.partyMax;
}

export function isSeatable(table: FloorTable): boolean {
  return table.state !== "occupied" && !table.blocked;
}

export type TimelineBlock = {
  readonly id: string;
  readonly tone: FloorTone;
  readonly label: string;
  /** 0..1 of the service span. */
  readonly start: number;
  readonly end: number;
};

export type TimelineRow = { readonly table: FloorTable; readonly label: string; readonly blocks: TimelineBlock[] };

/** A fraction of the span, clamped so a block never draws outside the grid. */
function frac(ms: number, spanStart: number, spanEnd: number): number {
  if (spanEnd <= spanStart) return 0;
  return Math.min(1, Math.max(0, (ms - spanStart) / (spanEnd - spanStart)));
}

/**
 * The timeline's rows and blocks. One row per primary table; a seated visit
 * is a block from its opening to its due time (or an hour when no turn time
 * is known), the overrun a second block from the due time to now; a held
 * booking a block from its time for the turn; a vacated table a small
 * marker at the vacating time. Tonight's other bookings on the same table
 * are drawn from the book, so a hold reads against the next commitment.
 */
export function timelineRows(input: {
  tables: readonly FloorTable[];
  book: readonly FloorBookEntry[];
  spanStartMs: number;
  spanEndMs: number;
  nowMs: number;
  defaultTurnMinutes: number;
  words: { seated: string; over: string; reset: string; bookedTo: (n: number, iso: string) => string; held: (name: string, n: number, iso: string) => string; walkIn: string };
}): TimelineRow[] {
  const { spanStartMs: s, spanEndMs: e } = input;
  const rows: TimelineRow[] = [];
  for (const t of input.tables) {
    if (t.joinedFromSpaceId) continue;
    const blocks: TimelineBlock[] = [];
    const code = tableCode(t);
    if (t.state === "occupied" && t.openedAtIso) {
      const opened = Date.parse(t.openedAtIso);
      const turn = (t.turnMinutes ?? input.defaultTurnMinutes) * 60_000;
      const due = t.dueAtIso ? Date.parse(t.dueAtIso) : opened + turn;
      blocks.push({
        id: `${t.spaceId}:seated`,
        tone: "seated",
        label: t.dueAtIso ? input.words.bookedTo(t.partySize ?? 0, t.dueAtIso) : `${t.partySize ?? ""} · ${input.words.seated}`,
        start: frac(opened, s, e),
        end: frac(Math.max(due, opened + 15 * 60_000), s, e),
      });
      if (t.overdue && input.nowMs > due) {
        blocks.push({ id: `${t.spaceId}:over`, tone: "over", label: input.words.over, start: frac(due, s, e), end: frac(input.nowMs, s, e) });
      }
    } else if (t.state === "held" && t.held) {
      const at = Date.parse(t.held.startsAtIso);
      const turn = (t.turnMinutes ?? input.defaultTurnMinutes) * 60_000;
      blocks.push({
        id: `${t.spaceId}:held`,
        tone: t.held.late ? "held" : "arriving",
        label: input.words.held(t.held.holderName ?? input.words.walkIn, t.held.partySize, t.held.startsAtIso),
        start: frac(at, s, e),
        end: frac(at + turn, s, e),
      });
    } else if (t.needsResetSinceIso) {
      const at = Date.parse(t.needsResetSinceIso);
      blocks.push({ id: `${t.spaceId}:reset`, tone: "reset", label: input.words.reset, start: frac(at, s, e), end: frac(at + 20 * 60_000, s, e) });
    }
    for (const b of input.book) {
      if (b.spaceCode !== code) continue;
      if (b.state !== "booked" && b.state !== "arriving") continue;
      const at = Date.parse(b.startsAtIso);
      if (t.state === "held" && t.held?.admissionId === b.admissionId) continue;
      const turn = (t.turnMinutes ?? input.defaultTurnMinutes) * 60_000;
      blocks.push({
        id: `${t.spaceId}:${b.admissionId}`,
        tone: "arriving",
        label: input.words.held(b.holderName ?? input.words.walkIn, b.partySize, b.startsAtIso),
        start: frac(at, s, e),
        end: frac(at + turn, s, e),
      });
    }
    rows.push({ table: t, label: tableLabel(t, input.tables), blocks });
  }
  return rows;
}

/** Hour ticks across the span, on the hour, as fractions with their instants. */
export function timelineTicks(spanStartMs: number, spanEndMs: number, stepMinutes = 30): Array<{ at: number; fraction: number }> {
  const step = stepMinutes * 60_000;
  const first = Math.ceil(spanStartMs / step) * step;
  const ticks: Array<{ at: number; fraction: number }> = [];
  for (let at = first; at <= spanEndMs; at += step) {
    ticks.push({ at, fraction: frac(at, spanStartMs, spanEndMs) });
  }
  return ticks;
}
