import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { legsBalance, projectBookingPayment } from "./project";
import { groupIdFor } from "./write";
import { projectionHealth, type ProjectionRunResult } from "./run-projection";

const rd = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const counts = (o: Partial<{ projected: number; skipped: number; refused: number }> = {}) => ({ projected: 0, skipped: 0, refused: 0, ...o });
const run = (o: Partial<ProjectionRunResult> = {}): ProjectionRunResult => ({
  ok: true,
  bookingPayments: { ...counts(), unattributable: 0 },
  processingFees: counts(),
  invoices: counts(),
  payouts: counts(),
  transfers: counts(),
  refusals: [],
  ...o,
});

describe("paid run #2 example: MX$1,000 sale + 1.5% client fee (gross charged 101,500)", () => {
  const lane = { participantId: "p1", talentProfileId: "tal1", owningPartyType: "talent", owningPartyId: "tal1", talentNetCents: 100_000, workspaceFeeCents: 0, platformFeeCents: 1_500, grossChargedCents: 101_500 };
  const projected = projectBookingPayment({ transactionId: "f15c22ff", bookingId: "b1", tenantId: "hub", currency: "mxn", grossChargedCents: 101_500, lanes: [lane], providerObjectId: "pi_1", occurredAt: "2026-10-09T10:10:57Z" });

  it("projects three balanced legs: balance +101,500, talent payable -100,000, platform commission -1,500", () => {
    assert.ok(projected.ok);
    if (!projected.ok) return;
    assert.equal(legsBalance(projected.legs), true);
    const by = Object.fromEntries(projected.legs.map((l) => [l.accountCode, l.amountCents]));
    assert.deepEqual(by, { stripe_balance: 101_500, talent_payable: -100_000, platform_commission: -1_500 });
    assert.equal(projected.legs.find((l) => l.accountCode === "talent_payable")?.talentProfileId, "tal1", "the talent leg carries her id");
  });

  it("re-running is idempotent: the same transaction always yields the same group id", () => {
    assert.ok(projected.ok);
    if (!projected.ok) return;
    const again = projectBookingPayment({ transactionId: "f15c22ff", bookingId: "b1", tenantId: "hub", currency: "mxn", grossChargedCents: 101_500, lanes: [lane], providerObjectId: "pi_1", occurredAt: "2026-10-09T10:10:57Z" });
    assert.ok(again.ok);
    if (!again.ok) return;
    assert.equal(groupIdFor(projected.legs[0].groupKey), groupIdFor(again.legs[0].groupKey));
  });
});

describe("the heartbeat tells the truth", () => {
  it("projected=0 with a fresh refusal is NOT ok, and names the reason", () => {
    const h = projectionHealth(run({ bookingPayments: { ...counts({ refused: 3 }), unattributable: 0 }, refusals: ["booking_payment x: no commission lanes"] }));
    assert.equal(h.ok, false);
    assert.match(h.detail, /refused=3/);
    assert.match(h.detail, /first refusal: booking_payment x: no commission lanes/);
  });
  it("a run that projected something is ok even with a refusal (the refusal is still reported)", () => {
    const h = projectionHealth(run({ bookingPayments: { ...counts({ projected: 2, refused: 1 }), unattributable: 0 }, refusals: ["r"] }));
    assert.equal(h.ok, true);
    assert.match(h.detail, /refused=1/);
  });
  it("old unattributable payments never turn the heartbeat red", () => {
    const h = projectionHealth(run({ bookingPayments: { ...counts({ skipped: 4 }), unattributable: 6 } }));
    assert.equal(h.ok, true);
    assert.match(h.detail, /unattributable=6/);
  });
  it("a failed read is not ok", () => {
    assert.equal(projectionHealth(run({ ok: false, error: "boom" })).ok, false);
  });
});

describe("the runner no longer swallows reads or starves on old rows (static pins)", () => {
  const src = rd("./run-projection.ts");
  it("never selects the non-existent snapshot column", () => {
    const snap = src.slice(src.indexOf('.from("booking_commission_snapshot")'), src.indexOf('.in("booking_id", bookingIds)') + 40);
    assert.doesNotMatch(snap, /talent_profile_id/);
    assert.match(src, /inquiry_participants/);
  });
  it("pages newest first by (paid_at, id) with a keyset cursor", () => {
    assert.match(src, /\.order\("paid_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/);
    assert.match(src, /paid_at\.lt\.\$\{cursor\.paidAt\},and\(paid_at\.eq\.\$\{cursor\.paidAt\},id\.lt\.\$\{cursor\.id\}\)/);
  });
  it("every read checks its error", () => {
    for (const t of ["booking_transactions", "booking_commission_snapshot", "inquiry_participants", "provider_balance_transactions", "provider_invoices", "provider_payouts"]) {
      assert.match(src, new RegExp(`readFailed\\("${t}"`), `${t} read is checked`);
    }
  });
  it("a dry run writes nothing", () => {
    assert.match(src, /opts\.dryRun \? dryWrite\(sb, legs\) : writeLedgerGroup\(legs\)/);
    assert.doesNotMatch(src.slice(src.indexOf("async function dryWrite"), src.indexOf("export async function runLedgerProjection")), /\.insert\(/);
  });
  it("the route records the honest health and offers ?dry=1", () => {
    const route = rd("../../app/api/cron/project-ledger/route.ts");
    assert.match(route, /projectionHealth\(result\)/);
    assert.match(route, /searchParams\.get\("dry"\) === "1"/);
    assert.doesNotMatch(route, /ok: result\.ok,\n\s*detail/);
  });
});
