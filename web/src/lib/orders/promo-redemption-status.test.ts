import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { applyPromo, type PromoCode } from "@/lib/events/promo";
import {
  PROMO_REDEMPTION_STATUSES,
  countsTowardLimit,
  isConfirmedUse,
  voidRedemptionPatch,
  type PromoRedemptionStatus,
} from "@/lib/orders/promo-redemption-status";

/**
 * TUL-940: a redemption row only counts when its status says it is a use.
 * Contract-first for Promos v1, which adds held / released rows.
 */

const read = (rel: string) => blankComments(readFileSync(join(process.cwd(), rel), "utf8"));

type Row = { status: PromoRedemptionStatus; customerId: string };

function limitCounts(rows: readonly Row[], customerId: string) {
  const live = rows.filter((r) => countsTowardLimit(r.status));
  return { total: live.length, forThisCustomer: live.filter((r) => r.customerId === customerId).length };
}

const ONE_USE: PromoCode = {
  id: "code-1", code: "COMP", kind: "fixed", value: 500, currency: "MXN", isActive: true,
  startsAt: null, endsAt: null, maxRedemptions: 1, perCustomerLimit: 1, eventId: null, variantId: null,
};

function decide(rows: readonly Row[], customerId: string) {
  return applyPromo(ONE_USE, {
    now: new Date(),
    subtotalCents: 10_000,
    eventId: null,
    variantIds: [],
    counts: limitCounts(rows, customerId),
  });
}

test("limits count confirmed + held + no_show; voided and released free the slot", () => {
  const counted = PROMO_REDEMPTION_STATUSES.filter(countsTowardLimit);
  assert.deepEqual([...counted].sort(), ["confirmed", "held", "no_show"]);
});

test("a reported use is confirmed only", () => {
  assert.deepEqual(PROMO_REDEMPTION_STATUSES.filter(isConfirmedUse), ["confirmed"]);
});

test("a max-1 code with one VOIDED use can be redeemed again (same customer too)", () => {
  assert.equal(decide([{ status: "voided", customerId: "c1" }], "c1").ok, true);
});

test("a max-1 code with one RELEASED hold can be redeemed again", () => {
  assert.equal(decide([{ status: "released", customerId: "c2" }], "c1").ok, true);
});

test("a max-1 code with one confirmed use is exhausted", () => {
  const r = decide([{ status: "confirmed", customerId: "c2" }], "c1");
  assert.equal(r.ok, false);
});

test("a live hold still guards the limit", () => {
  assert.equal(decide([{ status: "held", customerId: "c2" }], "c1").ok, false);
});

test("the void patch stamps status and time, nothing else", () => {
  const now = new Date();
  assert.deepEqual(voidRedemptionPatch(now), { status: "voided", voided_at: now.toISOString() });
});

test("full refund VOIDS the redemption; it never deletes it", () => {
  const src = read("src/lib/orders/refund-execute-lines.ts");
  assert.match(src, /releasePromo: releasesPromoRedemption\(plan\)/, "the FULL ruling still gates the release (partial keeps it confirmed)");
  // The release itself lives in the shared restore step (TUL-1268 M5), which the webhook also runs.
  const restore = read("src/lib/orders/refund-restore.ts");
  const at = restore.indexOf("if (input.releasePromo)");
  assert.ok(at > -1, "the release is gated on the caller's ruling");
  const block = restore.slice(at, at + 600);
  assert.match(block, /voidRedemptionPatch\(\)/);
  assert.doesNotMatch(block, /\.delete\(\)/, "deleting erases the audit trail");
  assert.doesNotMatch(src, /tenant_promo_redemptions"\)\s*\.delete\(/);
  assert.doesNotMatch(restore, /tenant_promo_redemptions"\)\s*\.delete\(/);
});

test("checkout counts only limit statuses, both total and per customer", () => {
  // TUL-935: checkout counts through the one engine read path (repo.loadUsage),
  // which counts total AND per-customer from the same LIMIT_STATUSES rows.
  const src = read("src/lib/orders/promo-resolve.ts");
  assert.match(src, /loadUsage\(admin, \w+, input\.customerId/);
  const repo = read("src/lib/promos/repo.ts");
  assert.match(repo, /\.in\("status", \[\.\.\.LIMIT_STATUSES\]\)/);
  assert.match(repo, /usedByClient \+= 1/);
});

test("the admin discounts page shows confirmed uses only", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/discounts/page.tsx");
  assert.match(src, /\.in\("status", \[\.\.\.USE_STATUSES\]\)/);
});

test("the redeem function counts confirmed + held under its lock", () => {
  const sql = readFileSync(
    join(process.cwd(), "../supabase/migrations/20261231381000_promo_redemption_status.sql"),
    "utf8",
  );
  const counts = sql.match(/AND status IN \('confirmed', 'held'\)/g) ?? [];
  assert.equal(counts.length, 2, "total AND per-customer");
  assert.match(sql, /status text NOT NULL DEFAULT 'confirmed'/, "backfill = every existing row is a use");
  assert.match(sql, /'held', 'confirmed', 'released', 'voided', 'no_show'/);
});
