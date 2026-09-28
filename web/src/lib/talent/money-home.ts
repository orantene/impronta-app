/**
 * Talent Money home (mockup mc_money / money_d) built ONLY from real sources:
 *   - earnings rows (booking_commission_snapshot via the layout bridge),
 *   - client balances (agency_bookings via loadTalentClients).
 * Nothing here reads the September ledger fixture. A number with no source is
 * returned as null so the page can say so instead of printing a zero.
 */

import type { TalentEarnings, TalentEarningsRow } from "./earnings-types";
import type { TalentClientRow } from "./clients-merge";

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

/** A client has paid for this row (fully or part). "confirmed" is unpaid pipeline. */
function isCollected(row: TalentEarningsRow): boolean {
  return row.status === "paid" || row.status === "invoiced" || row.status === "pending";
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
