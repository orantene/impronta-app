/**
 * TUL-1302: a live price phase is charged online, not just shown and rung up at the counter.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLinePhases } from "@/lib/orders/purchase-phases";
import { pricePurchase, type PricedOffering } from "@/lib/orders/purchase-pricing";

type Reply = { data: unknown; error: { message: string } | null };
type FakeQuery = {
  select: (...a: unknown[]) => FakeQuery;
  eq: (...a: unknown[]) => FakeQuery;
  lte: (...a: unknown[]) => Promise<Reply>;
};

const NOW = "2026-10-21T12:00:00.000Z";
const PHASE = { id: "ph_1", price_cents: 8000, starts_at: "2026-10-01T00:00:00.000Z", ends_at: null, variant_id: null };

function fakeAdmin(reply: Reply) {
  const reads: string[] = [];
  const admin = {
    from(table: string) {
      reads.push(table);
      const q: FakeQuery = { select: () => q, eq: () => q, lte: async () => reply };
      return q;
    },
  } as unknown as SupabaseClient;
  return { admin, reads };
}

const offering: PricedOffering = {
  offeringId: "off_1", label: "Class", amountCents: 10000, priceType: "fixed",
  talentProfileId: null, ownerTenantId: "t1", talentCostCents: 0,
};
const catalog = { offerings: new Map([["off_1", offering]]), variants: new Map(), addons: new Map() };

test("a live phase replaces the list price and is stamped on the line (10000 -> 8000)", async () => {
  const { admin } = fakeAdmin({ data: [PHASE], error: null });
  const live = await loadLinePhases(admin, { tenantId: "t1", lines: [{ offeringId: "off_1" }], nowIso: NOW });
  assert.equal(live.ok, true);
  if (!live.ok) return;
  const r = pricePurchase([{ offeringId: "off_1", units: 2, ...live.phases[0] }], catalog);
  assert.equal(r.ok && r.lines[0].unitCents, 8000);
  assert.equal(r.ok && r.subtotalCents, 16000);
  assert.equal(r.ok && r.lines[0].pricePhaseId, "ph_1");
});

test("no live phase: the list price stands and nothing is stamped", async () => {
  const { admin } = fakeAdmin({ data: [], error: null });
  const live = await loadLinePhases(admin, { tenantId: "t1", lines: [{ offeringId: "off_1" }], nowIso: NOW });
  assert.equal(live.ok && live.phases[0].phasePriceCents, null);
  const r = pricePurchase([{ offeringId: "off_1", units: 1, ...(live.ok ? live.phases[0] : {}) }], catalog);
  assert.equal(r.ok && r.subtotalCents, 10000);
  assert.equal(r.ok && r.lines[0].pricePhaseId, undefined);
});

test("a failed phase read refuses: it is a price we do not know, not the list price", async () => {
  const { admin } = fakeAdmin({ data: null, error: { message: "db down" } });
  const live = await loadLinePhases(admin, { tenantId: "t1", lines: [{ offeringId: "off_1" }], nowIso: NOW });
  assert.equal(live.ok, false);
});

test("two lines of one offering and tier read the phase once", async () => {
  const { admin, reads } = fakeAdmin({ data: [PHASE], error: null });
  const live = await loadLinePhases(admin, {
    tenantId: "t1", lines: [{ offeringId: "off_1" }, { offeringId: "off_1" }], nowIso: NOW,
  });
  assert.equal(live.ok && live.phases.length, 2);
  assert.equal(reads.length, 1);
});
