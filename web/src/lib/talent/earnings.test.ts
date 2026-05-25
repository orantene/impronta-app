import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTalentEarnings,
  EMPTY_TALENT_EARNINGS,
  mapBookingPayoutStatus,
  type TalentSnapshotAggregateRow,
} from "@/lib/talent/earnings-types";

const SAMPLE_ROWS: TalentSnapshotAggregateRow[] = [
  {
    bookingId: "bk-1",
    bookingTalentId: "bt-1",
    tenantId: "tenant-a",
    agencySlug: "atelier-roma",
    agencyName: "Atelier Roma",
    workDate: "2026-03-28",
    payoutDate: "2026-04-04",
    clientLabel: "Zara",
    grossCents: 200_000,
    netCents: 164_000,
    workspaceFeeCents: 36_000,
    status: "paid",
    source: "agency_routed",
    paymentMethod: "bank_transfer",
  },
  {
    bookingId: "bk-2",
    bookingTalentId: "bt-2",
    tenantId: "tenant-b",
    agencySlug: "praline-london",
    agencyName: "Praline London",
    workDate: "2026-04-18",
    payoutDate: null,
    clientLabel: "Burberry",
    grossCents: 240_000,
    netCents: 190_000,
    workspaceFeeCents: 50_000,
    status: "confirmed",
    source: "agency_routed",
    paymentMethod: "card",
  },
];

test("buildTalentEarnings aggregates totals and per-agency cards", () => {
  const earnings = buildTalentEarnings(SAMPLE_ROWS);

  assert.equal(earnings.totals.currency, "EUR");
  assert.equal(earnings.totals.ytdGrossCents, 440_000);
  assert.equal(earnings.totals.ytdNetCents, 354_000);
  assert.equal(earnings.totals.pendingCents, 0);
  assert.equal(earnings.totals.confirmedPipelineCents, 190_000);
  assert.equal(earnings.perAgency.length, 2);
  assert.equal(earnings.rows.length, 2);
  assert.equal(earnings.perAgency[0]?.tenantId, "tenant-b");
  assert.equal(earnings.perAgency[0]?.bookingsCount, 1);
  assert.equal(earnings.perAgency[0]?.commissionBps, 2083);
});

test("buildTalentEarnings returns empty shape for zero bookings", () => {
  const earnings = buildTalentEarnings([]);
  assert.deepEqual(earnings.totals, EMPTY_TALENT_EARNINGS.totals);
  assert.deepEqual(earnings.perAgency, []);
  assert.deepEqual(earnings.rows, []);
});

test("buildTalentEarnings tracks pending vs confirmed pipeline cents", () => {
  const earnings = buildTalentEarnings([
    {
      ...SAMPLE_ROWS[0]!,
      status: "invoiced",
      netCents: 100_000,
    },
    {
      ...SAMPLE_ROWS[1]!,
      status: "pending",
      netCents: 50_000,
    },
  ]);

  assert.equal(earnings.totals.pendingCents, 150_000);
  assert.equal(earnings.totals.confirmedPipelineCents, 0);
});

test("mapBookingPayoutStatus maps lifecycle values", () => {
  assert.equal(
    mapBookingPayoutStatus({
      payout_lifecycle: "paid",
      payment_status: "paid",
      status: "completed",
    }),
    "paid",
  );
  assert.equal(
    mapBookingPayoutStatus({
      payout_lifecycle: "scheduled",
      payment_status: "paid",
      status: "confirmed",
    }),
    "invoiced",
  );
});

test("buildTalentEarnings row shape includes ledger fields", () => {
  const earnings = buildTalentEarnings(SAMPLE_ROWS);
  const row = earnings.rows[0];
  assert.ok(row);
  assert.equal(typeof row.id, "string");
  assert.equal(typeof row.workDate, "string");
  assert.equal(typeof row.agencyName, "string");
  assert.equal(typeof row.client, "string");
  assert.equal(typeof row.grossCents, "number");
  assert.equal(typeof row.netCents, "number");
  assert.ok(["paid", "invoiced", "pending", "confirmed"].includes(row.status));
});
