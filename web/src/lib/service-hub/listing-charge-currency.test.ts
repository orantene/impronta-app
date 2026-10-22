/**
 * TUL-1591 (d) [MONEY]: a hub listing is charged in the SELLER OF RECORD's explicit
 * currency, and refuses when that currency is missing or does not match the priced
 * amounts. Never a default, never "", never the other party's currency, never converted.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listingChargeCurrency, listingChargeRefusalMessage, sellerOfRecordForModel } from "./listing-charge-currency";
import { refuseHubListingChargeCurrency } from "./listing-charge-currency.server";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const base = { workModel: "coordinator_agency", workspaceCurrency: "MXN", talentCurrency: "USD", listingCurrency: "MXN", serviceCurrency: "MXN" };

describe("seller of record by model", () => {
  test("the workspace sells in coordinator, collective and team models; the talent in open network and rental studio", () => {
    for (const m of ["coordinator_agency", "friends_collective", "team_studio"]) assert.equal(sellerOfRecordForModel(m), "workspace", m);
    for (const m of ["open_network", "rental_studio"]) assert.equal(sellerOfRecordForModel(m), "talent", m);
  });
  test("a missing or unknown model has no seller (refuse)", () => {
    for (const m of [null, undefined, "", "agency", 3]) assert.equal(sellerOfRecordForModel(m), null);
  });
});

describe("the charge currency", () => {
  test("workspace seller: charged in the workspace's currency when every price is in it", () => {
    assert.deepEqual(listingChargeCurrency(base), { ok: true, currency: "MXN", seller: "workspace" });
  });
  test("talent seller: charged in the talent's currency, never the workspace's", () => {
    const r = listingChargeCurrency({ ...base, workModel: "open_network", listingCurrency: "usd", serviceCurrency: " USD " });
    assert.deepEqual(r, { ok: true, currency: "USD", seller: "talent" });
  });
  test("a missing, blank or malformed seller currency refuses; it never falls back to the other party's", () => {
    for (const workspaceCurrency of [null, undefined, "", "  ", "MX", "PESOS", 484]) {
      assert.deepEqual(listingChargeCurrency({ ...base, workspaceCurrency }), { ok: false, reason: "seller_currency_missing" }, String(workspaceCurrency));
    }
    // the talent's USD is right there, and still not used
    assert.deepEqual(listingChargeCurrency({ ...base, workspaceCurrency: null, listingCurrency: "USD", serviceCurrency: "USD" }), { ok: false, reason: "seller_currency_missing" });
    assert.deepEqual(listingChargeCurrency({ ...base, workModel: "rental_studio", talentCurrency: "" }), { ok: false, reason: "seller_currency_missing" });
  });
  test("a missing listing or service currency refuses", () => {
    assert.deepEqual(listingChargeCurrency({ ...base, listingCurrency: "" }), { ok: false, reason: "listing_currency_missing" });
    assert.deepEqual(listingChargeCurrency({ ...base, serviceCurrency: null }), { ok: false, reason: "service_currency_missing" });
  });
  test("any mismatch refuses: nothing is converted", () => {
    assert.deepEqual(listingChargeCurrency({ ...base, listingCurrency: "USD" }), { ok: false, reason: "currency_mismatch" });
    assert.deepEqual(listingChargeCurrency({ ...base, serviceCurrency: "USD" }), { ok: false, reason: "currency_mismatch" });
    assert.deepEqual(listingChargeCurrency({ ...base, workModel: "open_network" }), { ok: false, reason: "currency_mismatch" });
  });
  test("an unknown model refuses before any currency is looked at", () => {
    assert.deepEqual(listingChargeCurrency({ ...base, workModel: null }), { ok: false, reason: "model_unknown" });
  });
  test("refusal copy in ES and EN says nothing was charged, with no em dash", () => {
    for (const r of ["currency_mismatch", "unreadable"] as const) {
      const en = listingChargeRefusalMessage(r, "en");
      const es = listingChargeRefusalMessage(r, "es-MX");
      assert.match(en, /Nothing was charged/);
      assert.match(es, /No se cobró nada/);
      assert.doesNotMatch(en + es, /\u2014/);
    }
  });
});

// ── the checkout gate (database reads) ──────────────────────────────────────

const LISTING = "11111111-1111-4111-8111-111111111111";
type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };

function fakeAdmin(over: Partial<Record<string, Reply>> & { rpc?: Reply } = {}) {
  const replies: Record<string, Reply> = {
    workspace_service_listings: { data: { id: LISTING, tenant_id: "t1", talent_profile_id: "tal", offering_id: "off", currency: "MXN" } },
    talent_offerings: { data: { id: "off", talent_profile_id: "tal", currency: "MXN" } },
    agencies: { data: { work_model: "coordinator_agency", default_currency: "MXN" } },
    talent_profiles: { data: { id: "tal", default_currency: "USD" } },
    ...over,
  };
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const q: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "neq"]) q[op] = () => q;
      q.maybeSingle = () => Promise.resolve(replies[table] ?? { data: null, error: null });
      return q;
    },
    rpc() {
      calls.push("rpc");
      return Promise.resolve(over.rpc ?? { data: [LISTING], error: null });
    },
  } as unknown as SupabaseClient & { calls: string[] };
}

const gate = (admin: SupabaseClient, extra: Partial<{ orderCurrency: string; offeringIds: string[]; listingId: string }> = {}) =>
  refuseHubListingChargeCurrency(admin, { tenantId: "t1", listingId: LISTING, orderCurrency: "MXN", offeringIds: ["off"], locale: "en", ...extra });

describe("the listing checkout currency gate", () => {
  test("passes with the seller's currency when everything matches", async () => {
    assert.deepEqual(await gate(fakeAdmin()), { ok: true, currency: "MXN" });
  });
  test("an order in another currency than the seller's is refused", async () => {
    const r = await gate(fakeAdmin(), { orderCurrency: "USD" });
    assert.equal(r.ok, false);
  });
  test("another workspace's listing, a missing listing or a service not in the basket is refused", async () => {
    assert.equal((await gate(fakeAdmin({ workspace_service_listings: { data: { id: LISTING, tenant_id: "t2", talent_profile_id: "tal", offering_id: "off", currency: "MXN" } } }))).ok, false);
    assert.equal((await gate(fakeAdmin({ workspace_service_listings: { data: null } }))).ok, false);
    assert.equal((await gate(fakeAdmin(), { offeringIds: ["other"] })).ok, false);
    assert.equal((await gate(fakeAdmin(), { listingId: "not-a-uuid" })).ok, false);
  });
  test("not sellable, or the sellable check failing, refuses", async () => {
    assert.equal((await gate(fakeAdmin({ rpc: { data: [], error: null } }))).ok, false);
    assert.equal((await gate(fakeAdmin({ rpc: { data: null, error: { message: "down" } } }))).ok, false);
  });
  test("a missing workspace model or currency refuses (fail closed, never a default)", async () => {
    assert.equal((await gate(fakeAdmin({ agencies: { data: { work_model: null, default_currency: "MXN" } } }))).ok, false);
    assert.equal((await gate(fakeAdmin({ agencies: { data: { work_model: "team_studio", default_currency: null } } }))).ok, false);
    assert.equal((await gate(fakeAdmin({ agencies: { data: null } }))).ok, false);
  });
  test("the service must be the listing talent's, in the seller's currency", async () => {
    assert.equal((await gate(fakeAdmin({ talent_offerings: { data: { id: "off", talent_profile_id: "someone", currency: "MXN" } } }))).ok, false);
    assert.equal((await gate(fakeAdmin({ talent_offerings: { data: { id: "off", talent_profile_id: "tal", currency: "USD" } } }))).ok, false);
  });
  test("a talent seller is charged in the talent's currency", async () => {
    const admin = fakeAdmin({
      agencies: { data: { work_model: "open_network", default_currency: "MXN" } },
      workspace_service_listings: { data: { id: LISTING, tenant_id: "t1", talent_profile_id: "tal", offering_id: "off", currency: "USD" } },
      talent_offerings: { data: { id: "off", talent_profile_id: "tal", currency: "USD" } },
    });
    assert.deepEqual(await gate(admin, { orderCurrency: "USD" }), { ok: true, currency: "USD" });
  });
  test("any read error or throw refuses", async () => {
    assert.equal((await gate(fakeAdmin({ talent_profiles: { data: null, error: { message: "x" } } }))).ok, false);
    assert.equal((await gate(fakeAdmin({ workspace_service_listings: { data: null, error: { code: "42P01" } } }))).ok, false);
    const throwing = { from() { throw new Error("boom"); }, rpc() { throw new Error("boom"); } } as unknown as SupabaseClient;
    assert.equal((await gate(throwing)).ok, false);
  });
});

describe("wiring", () => {
  test("the purchase pipeline runs the gate for a hub listing, after pricing and before the order exists", () => {
    const src = read("../orders/purchase.ts");
    const gateAt = src.indexOf("refuseHubListingChargeCurrency(admin");
    assert.ok(gateAt > 0, "purchase.ts calls the gate");
    assert.ok(gateAt > src.indexOf("const orderCurrency = ccy.currency"), "after the order currency is known");
    assert.ok(gateAt < src.indexOf('.from("orders")\n      .insert('), "before the order is inserted");
    assert.match(src, /input\.hubListingId \? await refuseHubListingChargeCurrency/);
  });
  test("the gate never falls back to a default currency", () => {
    const src = read("./listing-charge-currency.ts") + read("./listing-charge-currency.server.ts");
    assert.doesNotMatch(src, /PLATFORM_FALLBACK_CURRENCY|\?\? "USD"|\?\? "MXN"|\|\| "USD"|\|\| "MXN"/);
  });
});
