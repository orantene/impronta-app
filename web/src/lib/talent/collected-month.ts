/**
 * ONE definition of "collected" for a talent and a calendar month. Both the
 * Today (Hoy) "Collected" tile and the Money (Dinero) page read this, so the two
 * can never disagree for the same period (staging QA: Hoy showed $0 while Dinero
 * showed $4,300). Rows count by the month they were worked (`workDate`), money is
 * the ledger's collected amount when it has one (part payments, cash, transfers)
 * and the gross otherwise. Payout status plays no part: cash never makes a payout.
 */
import type { TalentEarnings, TalentEarningsRow } from "./earnings-types";
import { monthKeyInZone } from "@/lib/money/money-rules";

export type MoneyMethodBucket = "card" | "cash" | "transfer" | "other";

/** "2026-09" for a date-ish string, or null. */
export function monthKey(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 7) return null;
  const key = iso.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
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
 * talent payout) and partial deposits (mapBookingPayoutStatus collapses both).
 * Partials must not add full `grossCents` (a 30k deposit on a 100k booking would
 * show as 100k collected). Exclude until a real collected amount is on the row.
 */
export function isCollected(row: TalentEarningsRow): boolean {
  if (row.collectedCents != null && row.collectedCents > 0) return true;
  if (row.status === "paid" || row.status === "invoiced") return true;
  if (row.status !== "pending") return false;
  const ps = (row.paymentStatus ?? "").trim().toLowerCase();
  if (ps === "partial" || ps === "partially_paid") return false;
  return true;
}

export type CollectedForMonth = {
  month: string;
  currency: string;
  collectedCents: number;
  collectedCount: number;
  byMethod: Record<MoneyMethodBucket, number>;
  payments: TalentEarningsRow[];
};

/** The month key ("2026-10") for `now` in the talent's timezone (viewer zone when unknown). */
export function currentCollectedMonth(now: Date = new Date(), timeZone?: string | null): string {
  const zone = timeZone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");
  return monthKeyInZone(now, zone);
}

export function summarizeCollectedForMonth(
  earnings: TalentEarnings,
  month: string,
): { payments: TalentEarningsRow[]; collectedCents: number; byMethod: Record<MoneyMethodBucket, number> } {
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
  return { payments, collectedCents, byMethod };
}

/** The shared aggregate: what Hoy and Dinero both show for `month`. */
export function collectedForMonth(earnings: TalentEarnings, month: string): CollectedForMonth {
  const { payments, collectedCents, byMethod } = summarizeCollectedForMonth(earnings, month);
  return {
    month,
    currency: (earnings.totals.currency || "USD").toUpperCase(),
    collectedCents,
    collectedCount: payments.length,
    byMethod,
    payments,
  };
}
