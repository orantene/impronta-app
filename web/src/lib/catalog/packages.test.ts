import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { packageRefundShare, setOfferingComponents } from "./packages";

test("package refund splits by component share and the last row takes the remainder", () => {
  const shares = packageRefundShare({
    packageTotalCents: 10000,
    refundCents: 10000,
    components: [
      { componentOfferingId: "a", qty: 1, unitCents: 3333 },
      { componentOfferingId: "b", qty: 1, unitCents: 3333 },
      { componentOfferingId: "c", qty: 1, unitCents: 3334 },
    ],
  });
  assert.equal(shares.reduce((n, s) => n + s.cents, 0), 10000);
  assert.equal(shares[2]?.cents, 10000 - shares[0]!.cents - shares[1]!.cents);
});

test("a package cannot include itself or the same component twice", async () => {
  const admin = { from: () => ({}) };
  const cycle = await setOfferingComponents(admin, {
    tenantId: "t1",
    offeringId: "pkg",
    components: [{ componentOfferingId: "pkg", qty: 1, required: true }],
  });
  assert.equal(cycle.ok, false);
  if (!cycle.ok) assert.equal(cycle.reason, "cycle");

  const overlap = await setOfferingComponents(admin, {
    tenantId: "t1",
    offeringId: "pkg",
    components: [
      { componentOfferingId: "a", qty: 1, required: true },
      { componentOfferingId: "a", qty: 2, required: true },
    ],
  });
  assert.equal(overlap.ok, false);
  if (!overlap.ok) assert.equal(overlap.reason, "overlap");
});

test("offering_components live in the packages migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231220000_offering_packages_phases.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.offering_components/);
  assert.match(sql, /offering_price_phases/);
  assert.match(sql, /price_phase_id/);
});
