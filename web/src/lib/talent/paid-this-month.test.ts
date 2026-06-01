import { test } from "node:test";
import assert from "node:assert/strict";
import { computePaidThisMonth } from "@/lib/talent/paid-this-month";
import type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";

function earnings(rows: Partial<TalentEarningsRow>[], currency = "MXN"): TalentEarnings {
  return {
    totals: { ytdGrossCents: 0, ytdNetCents: 0, pendingCents: 0, confirmedPipelineCents: 0, currency },
    perAgency: [],
    rows: rows.map((r, i) => ({
      id: String(i), workDate: "", payoutDate: null, agencyName: "A", client: "C",
      grossCents: 0, netCents: 0, status: "paid", source: "unknown", paymentMethod: null, ...r,
    })),
  } as TalentEarnings;
}

const NOW = new Date("2026-06-15T00:00:00Z");

test("sums only paid rows with a payoutDate in the current month", () => {
  const e = earnings([
    { status: "paid", payoutDate: "2026-06-03", netCents: 80000 }, // in month ✓
    { status: "paid", payoutDate: "2026-06-28", netCents: 20000 }, // in month ✓
    { status: "paid", payoutDate: "2026-05-30", netCents: 50000 }, // prior month ✗
    { status: "pending", payoutDate: "2026-06-10", netCents: 99999 }, // not paid ✗
    { status: "paid", payoutDate: null, netCents: 12345 }, // no date ✗
  ]);
  const r = computePaidThisMonth(e, NOW);
  assert.equal(r.totalCents, 100000);
  assert.equal(r.count, 2);
  assert.equal(r.currency, "MXN");
});

test("returns zero for a talent with no paid bookings (honest empty state)", () => {
  const r = computePaidThisMonth(earnings([]), NOW);
  assert.equal(r.totalCents, 0);
  assert.equal(r.count, 0);
});

test("ignores unparseable payout dates", () => {
  const r = computePaidThisMonth(earnings([{ status: "paid", payoutDate: "not-a-date", netCents: 5000 }]), NOW);
  assert.equal(r.totalCents, 0);
});
