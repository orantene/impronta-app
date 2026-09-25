/**
 * Pure Agenda V2 derivations. Every function takes `now` — never Date.now().
 */

import type {
  BookingState,
  PaymentState,
  TalentAgendaItem,
} from "./types";

function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function itemLocalYmd(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return localYmd(date);
}

export function deriveBookingState(input: {
  kind: TalentAgendaItem["kind"];
  status?: string | null;
  holdUntil?: string | null;
  now: Date;
}): BookingState {
  if (input.kind === "request") return "requested";
  if (input.kind === "hold") {
    if (input.holdUntil && Date.parse(input.holdUntil) <= input.now.getTime()) {
      return "hold_expired";
    }
    return "hold";
  }
  const s = (input.status ?? "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "completed") return "completed";
  if (s === "no_show" || s === "no-show") return "no_show";
  if (s === "confirmed" || s === "in_progress" || s === "tentative") return "confirmed";
  return "confirmed";
}

export function derivePaymentState(input: {
  paymentStatus?: string | null;
  transactionStatus?: string | null;
  booking: BookingState;
  paidCents: number;
  totalCents: number;
  dueCents?: number;
  depositCents?: number;
  managedByAgency?: boolean;
  checking?: boolean;
  refundPending?: boolean;
  now: Date;
  dueAt?: string | null;
  balanceDueAt?: string | null;
  startsAt?: string | null;
}): PaymentState {
  if (input.managedByAgency) return "agency";
  if (input.refundPending || input.transactionStatus === "refund_pending") {
    return "refund_pending";
  }
  if (
    input.checking ||
    input.transactionStatus === "pending" ||
    input.transactionStatus === "processing"
  ) {
    return "checking";
  }
  const dueCents =
    input.dueCents ??
    Math.max(0, (input.totalCents || 0) - (input.paidCents || 0));
  const dueAt = input.dueAt ?? input.balanceDueAt ?? null;
  const ps = (input.paymentStatus ?? "").toLowerCase();
  if (ps === "paid" || (input.totalCents > 0 && input.paidCents >= input.totalCents)) {
    return "paid";
  }
  if (ps === "partial" || (input.paidCents > 0 && input.paidCents < input.totalCents)) {
    return "partial";
  }
  if (input.booking === "completed" && dueCents > 0) return "overdue";
  if (dueAt && Date.parse(dueAt) < input.now.getTime() && dueCents > 0) {
    return "overdue";
  }
  if (input.booking === "hold" && dueCents > 0) return "awaiting";
  if (dueCents > 0) return "due";
  if (ps === "unpaid" || ps === "") return dueCents > 0 ? "due" : "none";
  return "none";
}

export function blocksTime(item: Pick<TalentAgendaItem, "kind" | "booking" | "blocksTime">): boolean {
  if (item.kind === "deadline" || item.kind === "request") return false;
  if (item.booking === "cancelled" || item.booking === "hold_expired" || item.booking === "requested") {
    return false;
  }
  return item.blocksTime;
}

/** Occupied interval including travel before/after and buffer after. */
export function occupiedInterval(
  item: Pick<TalentAgendaItem, "startsAt" | "endsAt" | "where" | "bufferAfterMin">,
): { startsAt: Date; endsAt: Date } {
  const starts = new Date(item.startsAt);
  const ends = new Date(item.endsAt);
  const travel = Math.max(0, item.where.travelMin ?? 0);
  const buffer = Math.max(0, item.bufferAfterMin);
  return {
    startsAt: new Date(starts.getTime() - travel * 60_000),
    endsAt: new Date(ends.getTime() + (travel + buffer) * 60_000),
  };
}

export function needsAttention(
  items: readonly TalentAgendaItem[],
  now: Date,
): TalentAgendaItem[] {
  const scored: { item: TalentAgendaItem; rank: number }[] = [];
  for (const item of items) {
    let rank = 0;
    if (item.kind === "request" || item.booking === "requested") {
      // Agency-managed requests sort after direct ones (prototype urgency).
      rank = item.managedBy ? 50 : 10;
    } else if (item.booking === "hold" && (item.payment === "awaiting" || item.payment === "checking")) {
      rank = item.payment === "checking" ? 25 : 20;
    } else if (item.payment === "overdue") rank = 30;
    else if (item.tradeSection?.kind === "intake" && item.tradeSection.payload.status === "pending") {
      rank = 40;
    }
    // Today's unpaid confirmed work also needs a collect action (prototype).
    else if (
      item.kind === "booking" &&
      item.booking === "confirmed" &&
      itemLocalYmd(item.startsAt) === localYmd(now) &&
      item.money.dueCents > 0 &&
      (item.payment === "due" || item.payment === "partial")
    ) {
      rank = 35;
    }
    if (rank > 0) scored.push({ item, rank });
  }
  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return Date.parse(a.item.startsAt) - Date.parse(b.item.startsAt);
  });
  void now;
  return scored.map((s) => s.item);
}

export function todayTotals(
  items: readonly TalentAgendaItem[],
  now: Date,
  dayKey: string,
): {
  appointmentsToday: number;
  bookedMinutes: number;
  stillToCollectCents: number;
} {
  let appointmentsToday = 0;
  let bookedMinutes = 0;
  let stillToCollectCents = 0;
  for (const item of items) {
    const key = itemLocalYmd(item.startsAt);
    const isToday = key === dayKey;
    if (
      isToday &&
      item.kind === "booking" &&
      (item.booking === "confirmed" || item.booking === "completed")
    ) {
      appointmentsToday += 1;
      bookedMinutes += Math.max(
        0,
        Math.round((Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60_000),
      );
    }
    // Still to collect: overdue anywhere, plus amounts due on today's work.
    if (item.money.dueCents > 0) {
      if (item.payment === "overdue") {
        stillToCollectCents += item.money.dueCents;
      } else if (
        isToday &&
        (item.payment === "due" || item.payment === "partial" || item.payment === "awaiting")
      ) {
        stillToCollectCents += item.money.dueCents;
      }
    }
  }
  void now;
  return { appointmentsToday, bookedMinutes, stillToCollectCents };
}

export function weekCounts(items: readonly TalentAgendaItem[]): {
  all: number;
  requests: number;
  onHold: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
} {
  let requests = 0;
  let onHold = 0;
  let confirmed = 0;
  let completed = 0;
  let cancelled = 0;
  let noShow = 0;
  for (const item of items) {
    if (item.kind === "block" || item.kind === "deadline") continue;
    switch (item.booking) {
      case "requested":
        requests += 1;
        break;
      case "hold":
      case "hold_expired":
        onHold += 1;
        break;
      case "confirmed":
        confirmed += 1;
        break;
      case "completed":
        completed += 1;
        break;
      case "cancelled":
        cancelled += 1;
        break;
      case "no_show":
        noShow += 1;
        break;
      default:
        break;
    }
  }
  return {
    all: requests + onHold + confirmed + completed + cancelled + noShow,
    requests,
    onHold,
    confirmed,
    completed,
    cancelled,
    noShow,
  };
}

/** Format "1 h 50" from a future ISO time vs now. */
export function formatCountdown(untilIso: string, now: Date): string {
  const ms = Date.parse(untilIso) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "0 min";
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

/**
 * Free gaps on a day after occupied intervals (buffers + travel included).
 * Reuses BusyInterval math; hours windows are {startMin,endMin} from midnight.
 */
export function freeGaps(
  day: Date,
  items: readonly TalentAgendaItem[],
  hours: { windows: { startMin: number; endMin: number }[] } | null,
  now: Date,
): { startsAt: Date; endsAt: Date }[] {
  if (!hours || hours.windows.length === 0) return [];
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const occupied = items
    .filter((item) => blocksTime(item))
    .filter((item) => {
      const d = new Date(item.startsAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      return key === dayKey;
    })
    .map((item) => occupiedInterval(item))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const gaps: { startsAt: Date; endsAt: Date }[] = [];
  for (const win of hours.windows) {
    let cursor = new Date(dayStart.getTime() + win.startMin * 60_000);
    const winEnd = new Date(dayStart.getTime() + win.endMin * 60_000);
    if (cursor < now && winEnd > now) cursor = new Date(now);
    for (const block of occupied) {
      if (block.endsAt <= cursor) continue;
      if (block.startsAt >= winEnd) break;
      if (block.startsAt > cursor) {
        gaps.push({ startsAt: cursor, endsAt: block.startsAt < winEnd ? block.startsAt : winEnd });
      }
      if (block.endsAt > cursor) cursor = block.endsAt;
    }
    if (cursor < winEnd) gaps.push({ startsAt: cursor, endsAt: winEnd });
  }
  return gaps.filter((g) => g.endsAt.getTime() - g.startsAt.getTime() >= 15 * 60_000);
}
