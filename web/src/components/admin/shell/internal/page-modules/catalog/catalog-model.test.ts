/**
 * catalog-model.test.ts — the Catalog's judgements, and the one parity that
 * matters: `publishBlockers` (codes, said in three languages) refuses on
 * exactly the cases `validateOffering` (the writer's English) refuses on.
 *
 * Run: node_modules/.bin/tsx --test src/components/admin/shell/internal/page-modules/catalog/catalog-model.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { blankOffering, validateOffering, type TalentOffering } from "@/lib/talent/offerings-types";
import {
  categoryCounts,
  engineRefusalKey,
  exampleTotals,
  filterItems,
  packageAllocation,
  phaseState,
  itemAvailability,
  itemChannels,
  itemStatus,
  itemType,
  publishBlockers,
  tabFromQuery,
  viewFromQuery,
} from "./catalog-model";

function item(patch: Partial<TalentOffering> = {}): TalentOffering {
  return { ...blankOffering({ kind: "workspace", tenantId: "t1" }, "USD", 0), id: "o1", title: "Latte", amountCents: 6500, ...patch };
}

test("itemType: a quote-priced service is custom; kinds pass through", () => {
  assert.equal(itemType(item({ kind: "service", priceDisplay: "quote" })), "custom");
  assert.equal(itemType(item({ kind: "service" })), "service");
  assert.equal(itemType(item({ kind: "product", priceDisplay: "quote" })), "product");
});

test("itemChannels: only a published row sells; agency_only keeps it off the website", () => {
  assert.deepEqual(itemChannels(item({ status: "draft" })), []);
  assert.deepEqual(itemChannels(item({ status: "published" })), ["website", "pos"]);
  assert.deepEqual(itemChannels(item({ status: "published", visibility: "agency_only" })), ["pos"]);
});

test("itemAvailability: unlimited without a pool, sold out at zero", () => {
  assert.deepEqual(itemAvailability(item()), { mode: "unlimited" });
  assert.deepEqual(itemAvailability(item({ capacityPoolId: "p", inventoryQty: 3 })), { mode: "stock", left: 3, soldOut: false });
  assert.deepEqual(itemAvailability(item({ capacityPoolId: "p", inventoryQty: 0 })), { mode: "stock", left: 0, soldOut: true });
});

test("itemStatus: incomplete beats draft and published", () => {
  assert.equal(itemStatus(item({ status: "published" })).status, "published");
  assert.equal(itemStatus(item({ status: "draft" })).status, "draft");
  assert.equal(itemStatus(item({ status: "published", title: "" })).status, "incomplete");
});

test("filterItems: type, channel and incomplete-only compose", () => {
  const rows = [item({ id: "a", kind: "product" }), item({ id: "b", kind: "service", status: "draft" }), item({ id: "c", kind: "package", title: "" })];
  assert.deepEqual(filterItems(rows, { type: "service", channel: "any", incompleteOnly: false }).map((r) => r.id), ["b"]);
  assert.deepEqual(filterItems(rows, { type: "all", channel: "website", incompleteOnly: false }).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(filterItems(rows, { type: "all", channel: "any", incompleteOnly: true }).map((r) => r.id), ["c"]);
});

test("categoryCounts: first-seen order, uncategorised counted under null", () => {
  const rows = [item({ category: "Coffee" }), item({ category: null }), item({ category: "Coffee" }), item({ category: " Food " })];
  assert.deepEqual(categoryCounts(rows), [
    { category: "Coffee", count: 2 },
    { category: null, count: 1 },
    { category: "Food", count: 1 },
  ]);
});

test("exampleTotals: base, the first extra, times two", () => {
  assert.deepEqual(exampleTotals(item({ addOns: [{ id: "x", label: "Oat", amountCents: 1000 }] })), {
    baseCents: 6500,
    extraLabel: "Oat",
    extraCents: 1000,
    timesTwoCents: 15000,
  });
  assert.equal(exampleTotals(item({ amountCents: null })).timesTwoCents, null);
});

test("publishBlockers refuses on exactly the cases validateOffering refuses on", () => {
  const cases: Partial<TalentOffering>[] = [
    {},
    { title: "  " },
    { amountCents: null },
    { priceDisplay: "quote", amountCents: null },
    { priceType: "custom", amountCents: null },
    { bookingMode: "instant" },
    { bookingMode: "instant", priceDisplay: "from" },
    { bookingMode: "instant", amountCents: null },
    { bookingMode: "instant", amountCents: 0 },
    { bookingMode: "instant", reserveMode: "deposit", depositPct: null },
    { bookingMode: "instant", reserveMode: "deposit", depositPct: 100 },
    { bookingMode: "instant", reserveMode: "deposit", depositPct: 30 },
    { requiresIdentity: true, identityReason: null },
    { requiresIdentity: true, identityReason: "delivery" },
    { currency: "" },
    { currency: "US" },
    { title: "", amountCents: null, currency: "" },
  ];
  for (const c of cases) {
    const o = item(c);
    assert.equal(publishBlockers(o).length, validateOffering(o).length, JSON.stringify(c));
  }
});

test("query readers fall back to the first tab and view", () => {
  assert.equal(tabFromQuery("pricing"), "pricing");
  assert.equal(tabFromQuery("nope"), "details");
  assert.equal(viewFromQuery("structure"), "structure");
  assert.equal(viewFromQuery(null), "items");
});

// ── Package 2: packages and price phases ─────────────────────────────

test("packageAllocation weights by qty x list price and sums to the package exactly", () => {
  const shares = packageAllocation(420000, [
    { qty: 1, unitCents: 200000 },
    { qty: 1, unitCents: 120000 },
    { qty: 10, unitCents: 10000 },
  ]);
  assert.deepEqual(shares, [200000, 120000, 100000]);
  const odd = packageAllocation(100, [
    { qty: 1, unitCents: 1 },
    { qty: 1, unitCents: 1 },
    { qty: 1, unitCents: 1 },
  ]);
  assert.equal(odd.reduce<number>((n, c) => n + (c ?? 0), 0), 100);
});

test("packageAllocation refuses to weigh nothing: null per row, never zero", () => {
  assert.deepEqual(packageAllocation(null, [{ qty: 1, unitCents: 100 }]), [null]);
  assert.deepEqual(packageAllocation(5000, [{ qty: 1, unitCents: null }]), [null]);
});

test("phaseState mirrors livePhasePrice: upcoming, live, ended", () => {
  const now = "2026-09-11T12:00:00.000Z";
  assert.equal(phaseState({ startsAt: "2026-09-12T00:00:00Z", endsAt: null }, now), "upcoming");
  assert.equal(phaseState({ startsAt: "2026-09-01T00:00:00Z", endsAt: null }, now), "live");
  assert.equal(phaseState({ startsAt: "2026-09-01T00:00:00Z", endsAt: "2026-09-11T12:00:00Z" }, now), "ended");
  assert.equal(phaseState({ startsAt: "2026-09-01T00:00:00Z", endsAt: "2026-09-11T12:00:01Z" }, now), "live");
});

test("engineRefusalKey: a contract code is its sentence key, anything else is unavailable", () => {
  assert.equal(engineRefusalKey("cycle"), "dashboard.scheduling.engine.refusal.cycle");
  assert.equal(engineRefusalKey("made_up"), "dashboard.scheduling.engine.refusal.unavailable");
});
