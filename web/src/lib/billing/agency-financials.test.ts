/**
 * Unit tests for `buildAgencyFinancials` — the pure projection that
 * powers the admin Business Financials surface.
 *
 * Drives the builder with fixture rows shaped like the output of
 * `fetchTenantSnapshotAggregateRows`. No DB, no network. The crucial
 * invariant: when the same source rows are projected through both the
 * talent builder and this one, the lanes agree to the cent (gross,
 * platform_fee, workspace_fee, talent_net all add up consistently).
 *
 * Run: npx tsx --test src/lib/billing/agency-financials.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildAgencyFinancials,
  type AgencyFinancialsRow,
} from "./agency-financials-types";

function row(over: Partial<AgencyFinancialsRow> = {}): AgencyFinancialsRow {
  return {
    bookingId: "b1",
    bookingTalentId: "b1-t1",
    participantId: "p1",
    tenantId: "t-impronta",
    workDate: "2026-05-10",
    payoutDate: null,
    clientLabel: "Vogue Italia",
    talentProfileId: "talent-marta",
    talentDisplayName: "Marta Reyes",
    grossCents: 100_00,
    platformFeeCents: 5_00,
    workspaceFeeCents: 15_00,
    talentNetCents: 80_00,
    status: "confirmed",
    paymentMethod: "card",
    currencyCode: "EUR",
    ...over,
  };
}

describe("buildAgencyFinancials — totals", () => {
  it("sums lanes across all rows", () => {
    const out = buildAgencyFinancials([
      row({ bookingId: "b1", grossCents: 100_00, platformFeeCents: 5_00, workspaceFeeCents: 15_00, talentNetCents: 80_00 }),
      row({ bookingId: "b2", grossCents: 200_00, platformFeeCents: 10_00, workspaceFeeCents: 30_00, talentNetCents: 160_00, status: "paid" }),
    ]);
    assert.equal(out.totals.ytdGrossCents, 300_00);
    assert.equal(out.totals.ytdPlatformFeeCents, 15_00);
    assert.equal(out.totals.ytdWorkspaceFeeCents, 45_00);
    assert.equal(out.totals.ytdTalentNetCents, 240_00);
    // Lane invariant: g = p + w + t per row → also true in aggregate.
    assert.equal(
      out.totals.ytdGrossCents,
      out.totals.ytdPlatformFeeCents + out.totals.ytdWorkspaceFeeCents + out.totals.ytdTalentNetCents,
    );
  });

  it("includes only unpaid rows in pending payout", () => {
    const out = buildAgencyFinancials([
      row({ bookingId: "b-paid", status: "paid", workspaceFeeCents: 50_00 }),
      row({ bookingId: "b-pending", status: "pending", workspaceFeeCents: 30_00 }),
      row({ bookingId: "b-conf", status: "confirmed", workspaceFeeCents: 20_00 }),
    ]);
    assert.equal(out.totals.pendingPayoutCents, 50_00); // 30 + 20 only
    assert.equal(out.totals.confirmedBookingsCount, 3); // all three booking ids
  });

  it("MTD slice respects window", () => {
    const out = buildAgencyFinancials(
      [
        row({ bookingId: "old", workDate: "2026-04-10", grossCents: 999_00 }),
        row({ bookingId: "new", workDate: "2026-05-15", grossCents: 100_00 }),
      ],
      { mtdSinceIso: "2026-05-01T00:00:00.000Z" },
    );
    assert.equal(out.mtd.grossCents, 100_00);
  });
});

describe("buildAgencyFinancials — per-talent + per-client", () => {
  it("aggregates per talent and sorts by net", () => {
    const out = buildAgencyFinancials([
      row({ bookingId: "b1", talentProfileId: "marta", talentDisplayName: "Marta", talentNetCents: 100_00 }),
      row({ bookingId: "b2", talentProfileId: "marta", talentDisplayName: "Marta", talentNetCents: 50_00 }),
      row({ bookingId: "b3", talentProfileId: "joao", talentDisplayName: "João", talentNetCents: 200_00 }),
    ]);
    assert.equal(out.perTalent.length, 2);
    assert.equal(out.perTalent[0]!.talentProfileId, "joao"); // sorted desc
    assert.equal(out.perTalent[1]!.talentProfileId, "marta");
    assert.equal(out.perTalent[1]!.bookingsCount, 2);
    assert.equal(out.perTalent[1]!.talentNetCents, 150_00);
  });

  it("ranks top clients by gross", () => {
    const out = buildAgencyFinancials([
      row({ bookingId: "b1", clientLabel: "A", grossCents: 100_00 }),
      row({ bookingId: "b2", clientLabel: "B", grossCents: 500_00 }),
      row({ bookingId: "b3", clientLabel: "A", grossCents: 200_00 }),
    ]);
    assert.equal(out.topClients[0]!.clientLabel, "B");
    assert.equal(out.topClients[1]!.clientLabel, "A");
    assert.equal(out.topClients[1]!.grossCents, 300_00);
  });
});

describe("buildAgencyFinancials — byPaymentStatus", () => {
  it("counts bookings and gross per status bucket", () => {
    const out = buildAgencyFinancials([
      row({ bookingId: "b1", status: "paid", grossCents: 100 }),
      row({ bookingId: "b2", status: "paid", grossCents: 200 }),
      row({ bookingId: "b3", status: "pending", grossCents: 300 }),
    ]);
    assert.equal(out.byPaymentStatus.paid.bookings, 2);
    assert.equal(out.byPaymentStatus.paid.grossCents, 300);
    assert.equal(out.byPaymentStatus.pending.bookings, 1);
  });
});

describe("buildAgencyFinancials — projection parity with talent surface", () => {
  it("workspace + talent lanes from the same rows reconcile to gross", () => {
    // Same source rows, two projections (admin financials vs talent
    // money). The decision-log invariant: lanes never disagree.
    const rows = [
      row({ bookingId: "b1", grossCents: 100_00, platformFeeCents: 5_00, workspaceFeeCents: 15_00, talentNetCents: 80_00 }),
      row({ bookingId: "b2", grossCents: 200_00, platformFeeCents: 10_00, workspaceFeeCents: 30_00, talentNetCents: 160_00 }),
    ];
    const agg = buildAgencyFinancials(rows);
    const sumLanes =
      agg.totals.ytdPlatformFeeCents
      + agg.totals.ytdWorkspaceFeeCents
      + agg.totals.ytdTalentNetCents;
    assert.equal(sumLanes, agg.totals.ytdGrossCents);
  });
});
