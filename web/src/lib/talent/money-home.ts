/**
 * Talent Money home (mockup mc_money / money_d) built ONLY from real sources:
 *   - earnings rows (booking_commission_snapshot via the layout bridge),
 *   - client balances (agency_bookings via loadTalentClients).
 * Nothing here reads the September ledger fixture. A number with no source is
 * returned as null so the page can say so instead of printing a zero.
 */

import type { TalentEarnings, TalentEarningsRow } from "./earnings-types";
import type { TalentClientRow } from "./clients-merge";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

export type MoneyMethodBucket = "card" | "cash" | "transfer" | "other";

export type MoneyHomePayout = {
  key: string;
  /** YYYY-MM-DD, or null when a payout is scheduled with no date on file. */
  date: string | null;
  state: "paid" | "scheduled";
  netCents: number;
  count: number;
};

export type MoneyHomeOwed = {
  id: string;
  name: string;
  amountCents: number;
  overdue: boolean;
  nextStartsAt: string | null;
  bookingHref: string | null;
  conversationHref: string | null;
};

export type MoneyHomeView = {
  month: string;
  currency: string;
  collectedCents: number;
  collectedCount: number;
  byMethod: Record<MoneyMethodBucket, number>;
  owed: MoneyHomeOwed[];
  owedCents: number;
  overdueCents: number;
  paidOutCents: number;
  payouts: MoneyHomePayout[];
  nextPayoutCents: number | null;
  nextPayoutDate: string | null;
  payments: TalentEarningsRow[];
};

/** "2026-09" for a date-ish string, or null. */
export function monthKey(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 7) return null;
  const key = iso.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function methodBucket(raw: string | null | undefined): MoneyMethodBucket {
  const m = (raw ?? "").trim().toLowerCase();
  if (m === "card" || m === "apple_pay" || m === "google_pay" || m === "link") return "card";
  if (m === "cash") return "cash";
  if (m === "bank_transfer" || m === "wire" || m === "transfer" || m === "spei") return "transfer";
  return "other";
}

/**
 * Money that belongs in Collected. `pending` covers both fully paid (awaiting
 * talent payout) and partial deposits — mapBookingPayoutStatus collapses both.
 * Partials must not add full `grossCents` (a 30k deposit on a 100k booking would
 * show as 100k collected). Exclude until a real collected amount is on the row.
 */
function isCollected(row: TalentEarningsRow): boolean {
  // The ledger is the real answer when it has one: a part payment counts for
  // what was actually collected, not for the whole booking.
  if (row.collectedCents != null && row.collectedCents > 0) return true;
  if (row.status === "paid" || row.status === "invoiced") return true;
  if (row.status !== "pending") return false;
  const ps = (row.paymentStatus ?? "").trim().toLowerCase();
  if (ps === "partial" || ps === "partially_paid") return false;
  return true;
}

export function buildMoneyHomeView(input: {
  earnings: TalentEarnings;
  clients: readonly TalentClientRow[] | null;
  month: string;
}): MoneyHomeView {
  const { earnings, month } = input;
  const currency = earnings.totals.currency.toUpperCase();

  const payments = earnings.rows
    .filter((r) => isCollected(r) && monthKey(r.workDate) === month)
    .sort((a, b) => b.workDate.localeCompare(a.workDate));
  const byMethod: Record<MoneyMethodBucket, number> = { card: 0, cash: 0, transfer: 0, other: 0 };
  let collectedCents = 0;
  for (const r of payments) {
    const ledger = r.collectedCents != null && r.collectedCents > 0 ? r.collectedCents : null;
    if (ledger != null) {
      collectedCents += ledger;
      const split = r.collectedByMethod ?? {};
      let assigned = 0;
      for (const [m, cents] of Object.entries(split)) {
        byMethod[methodBucket(m)] += cents;
        assigned += cents;
      }
      if (assigned < ledger) byMethod[methodBucket(r.paymentMethod)] += ledger - assigned;
      continue;
    }
    collectedCents += r.grossCents;
    byMethod[methodBucket(r.paymentMethod)] += r.grossCents;
  }

  const payoutMap = new Map<string, MoneyHomePayout>();
  for (const r of earnings.rows) {
    if (r.status === "paid" && r.payoutDate && monthKey(r.payoutDate) === month) {
      const key = `paid:${r.payoutDate}`;
      const p = payoutMap.get(key) ?? { key, date: r.payoutDate, state: "paid", netCents: 0, count: 0 };
      p.netCents += r.netCents;
      p.count += 1;
      payoutMap.set(key, p);
    } else if (r.status === "invoiced") {
      const key = `scheduled:${r.payoutDate ?? "none"}`;
      const p =
        payoutMap.get(key) ?? { key, date: r.payoutDate, state: "scheduled", netCents: 0, count: 0 };
      p.netCents += r.netCents;
      p.count += 1;
      payoutMap.set(key, p);
    }
  }
  const payouts = [...payoutMap.values()].sort((a, b) =>
    (b.date ?? "9999").localeCompare(a.date ?? "9999"),
  );
  const paidOutCents = payouts
    .filter((p) => p.state === "paid")
    .reduce((n, p) => n + p.netCents, 0);
  const scheduled = payouts.filter((p) => p.state === "scheduled");
  const nextPayoutCents = scheduled.length ? scheduled.reduce((n, p) => n + p.netCents, 0) : null;
  const nextPayoutDate =
    scheduled
      .map((p) => p.date)
      .filter((d): d is string => !!d)
      .sort()[0] ?? null;

  const owed: MoneyHomeOwed[] = (input.clients ?? [])
    .filter(
      (c) =>
        (c.amountOwedCents ?? 0) > 0 && (c.currency ?? currency).toUpperCase() === currency,
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      amountCents: c.amountOwedCents ?? 0,
      overdue: c.overdue,
      nextStartsAt: c.nextStartsAt,
      bookingHref: c.nextBookingHref,
      conversationHref: c.conversationHref,
    }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.amountCents - a.amountCents);
  const owedCents = owed.reduce((n, o) => n + o.amountCents, 0);
  const overdueCents = owed.filter((o) => o.overdue).reduce((n, o) => n + o.amountCents, 0);

  return {
    month,
    currency,
    collectedCents,
    collectedCount: payments.length,
    byMethod,
    owed,
    owedCents,
    overdueCents,
    paidOutCents,
    payouts,
    nextPayoutCents,
    nextPayoutDate,
    payments,
  };
}

/** Months the talent has data in, newest first, always including `current`. */
export function moneyMonths(earnings: TalentEarnings, current: string): string[] {
  const set = new Set<string>([current]);
  for (const r of earnings.rows) {
    const a = monthKey(r.workDate);
    const b = monthKey(r.payoutDate);
    if (a) set.add(a);
    if (b) set.add(b);
  }
  return [...set].sort().reverse();
}

/** One line of money still to come, read from the agenda (holds and booked work). */
export type MoneyAgendaRow = {
  id: string;
  name: string;
  service: string;
  startsAt: string;
  /** null when no price is agreed yet: the page says so instead of printing $0. */
  amountCents: number | null;
  currency: string;
  kind: "deposit" | "balance";
  overdue: boolean;
  /** Overdue, or the appointment is today or earlier. */
  dueByToday: boolean;
  orderId: string | null;
  bookingHref: string;
};

type AgendaMoneyInput = Pick<
  TalentAgendaItem,
  "id" | "kind" | "title" | "client" | "startsAt" | "booking" | "payment" | "money" | "orderId"
>;

/**
 * Money the agenda already knows about but the earnings ledger does not:
 *   - owed: balances due on booked work (due, part paid, overdue, or finished unpaid),
 *   - waiting: deposits and payments requested on holds and bookings that are
 *     not owed yet ("Payment requests waiting" in mockup mc_outstanding).
 */
export function agendaMoneyRows(
  items: readonly AgendaMoneyInput[],
  now: Date,
): { owed: MoneyAgendaRow[]; waiting: MoneyAgendaRow[] } {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const owed: MoneyAgendaRow[] = [];
  const waiting: MoneyAgendaRow[] = [];
  for (const item of items) {
    if (item.kind !== "booking" && item.kind !== "hold") continue;
    if (
      item.booking === "cancelled" ||
      item.booking === "hold_expired" ||
      item.booking === "no_show" ||
      item.booking === "requested"
    ) {
      continue;
    }
    const name = item.client?.name ?? item.title;
    const base = {
      id: item.id,
      name,
      service: item.title && item.title.trim().toLowerCase() !== name.trim().toLowerCase() ? item.title : "",
      startsAt: item.startsAt,
      currency: (item.money.currency || "MXN").toUpperCase(),
      overdue: item.payment === "overdue",
      dueByToday: item.payment === "overdue" || Date.parse(item.startsAt) <= endOfToday.getTime(),
      orderId: item.orderId ?? null,
      bookingHref: `/talent/bookings/${item.id}`,
    };
    const unpaid = (item.money.paidCents ?? 0) === 0;
    const finishedUnpaid =
      item.booking === "completed" &&
      (item.payment === "none" || item.payment === "awaiting") &&
      item.money.dueCents > 0;
    if (item.payment === "due" || item.payment === "partial" || item.payment === "overdue" || finishedUnpaid) {
      if (item.money.dueCents <= 0) continue;
      owed.push({ ...base, kind: "balance", amountCents: item.money.dueCents });
      continue;
    }
    if ((item.payment === "awaiting" || item.payment === "none") && unpaid && item.booking !== "completed") {
      const amount = item.money.depositCents || item.money.dueCents || item.money.totalCents || 0;
      waiting.push({ ...base, kind: "deposit", amountCents: amount > 0 ? amount : null });
    }
  }
  const byDate = (a: MoneyAgendaRow, b: MoneyAgendaRow) => a.startsAt.localeCompare(b.startsAt);
  return { owed: owed.sort(byDate), waiting: waiting.sort(byDate) };
}

/**
 * F69: "Owed to you" as ONE number for every surface. The Money page and the
 * Today card both call this, so they can never disagree.
 *
 * Owed = the client ledger (agency_bookings balances via loadTalentClients), or
 * the agenda's balances when those are larger (booked work the ledger has not
 * caught up with). `count` = ledger clients plus agenda balances the ledger does
 * not already list.
 */
export function talentOwedSummary(input: {
  clients: readonly TalentClientRow[] | null;
  agendaOwed: readonly MoneyAgendaRow[];
  currency: string | null;
}): { cents: number; count: number; currency: string | null } {
  const currency = input.currency?.toUpperCase() ?? null;
  const ledger = (input.clients ?? []).filter(
    (c) => (c.amountOwedCents ?? 0) > 0 && (currency == null || (c.currency ?? currency).toUpperCase() === currency),
  );
  const ledgerCents = ledger.reduce((n, c) => n + (c.amountOwedCents ?? 0), 0);
  const agendaCents = input.agendaOwed.reduce((n, r) => n + (r.amountCents ?? 0), 0);
  const hrefs = new Set(ledger.map((c) => c.nextBookingHref).filter(Boolean));
  const extra = input.agendaOwed.filter((r) => !hrefs.has(r.bookingHref)).length;
  return {
    cents: Math.max(ledgerCents, agendaCents),
    count: ledger.length + extra,
    currency: currency ?? ledger[0]?.currency?.toUpperCase() ?? input.agendaOwed[0]?.currency ?? null,
  };
}
