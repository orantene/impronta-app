import { test } from "node:test";
import assert from "node:assert/strict";
import { computePaidThisMonth } from "@/lib/talent/paid-this-month";
import { buildMoneyHomeView } from "@/lib/talent/money-home";
import { collectedForMonth, currentCollectedMonth } from "@/lib/talent/collected-month";
import type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";

function earnings(rows: Partial<TalentEarningsRow>[], currency = "MXN"): TalentEarnings {
  const full: TalentEarningsRow[] = rows.map((r, i) => ({
    id: String(i), bookingId: `b${i}`, workDate: "", payoutDate: null, agencyName: "A", client: "C",
    grossCents: 0, netCents: 0, status: "paid", source: "unknown", paymentMethod: null, ...r,
  }));
  return {
    totals: { ytdGrossCents: 0, ytdNetCents: 0, pendingCents: 0, confirmedPipelineCents: 0, currency },
    perAgency: [],
    rows: full,
  };
}

const NOW = new Date("2026-10-15T18:00:00Z");

// The staging case: cash + transfer work, nothing paid out yet. Hoy used to read $0.
const rows: Partial<TalentEarningsRow>[] = [
  { status: "pending", workDate: "2026-10-03", grossCents: 150000, paymentMethod: "cash", collectedCents: 150000, collectedByMethod: { cash: 150000 } },
  { status: "invoiced", workDate: "2026-10-09", grossCents: 280000, paymentMethod: "bank_transfer" },
  { status: "paid", workDate: "2026-10-01", payoutDate: null, grossCents: 0, netCents: 0 },
  { status: "pending", workDate: "2026-10-12", grossCents: 100000, paymentStatus: "partial" }, // deposit, no ledger amount: excluded
  { status: "paid", workDate: "2026-09-20", payoutDate: "2026-10-02", grossCents: 99999, netCents: 80000 }, // other month
];

test("Hoy counts collected money, not just rows already paid out", () => {
  const r = computePaidThisMonth(earnings(rows), NOW, "UTC");
  assert.equal(r.totalCents, 430000);
  assert.equal(r.count, 3);
  assert.equal(r.currency, "MXN");
});

test("Hoy and Dinero agree for the same month on the same data", () => {
  const e = earnings(rows);
  const month = currentCollectedMonth(NOW, "UTC");
  const money = buildMoneyHomeView({ earnings: e, clients: null, month });
  const today = computePaidThisMonth(e, NOW, "UTC");
  assert.equal(today.totalCents, money.collectedCents);
  assert.equal(today.count, money.collectedCount);
  assert.equal(today.currency, money.currency);
  assert.equal(collectedForMonth(e, month).collectedCents, money.collectedCents);
});

test("month boundary uses the talent's timezone, not UTC", () => {
  // 2026-11-01T03:00Z is still Oct 31 in Mexico City.
  const edge = new Date("2026-11-01T03:00:00Z");
  assert.equal(currentCollectedMonth(edge, "America/Mexico_City"), "2026-10");
  assert.equal(currentCollectedMonth(edge, "UTC"), "2026-11");
});

test("returns zero for a talent with no bookings (honest empty state)", () => {
  const r = computePaidThisMonth(earnings([]), NOW, "UTC");
  assert.equal(r.totalCents, 0);
  assert.equal(r.count, 0);
});
