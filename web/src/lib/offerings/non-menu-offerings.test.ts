/**
 * TUL-1271 item 6: event-backing and reservation offerings never reach the POS
 * counter catalog or the QR guest menu; ordinary items still do.
 * Lane: `npm run test:money`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadCounterCatalog } from "@/app/(workspace)/[tenantSlug]/admin/pos/counter-catalog";
import { readFileSync } from "node:fs";
import { guestVisitAddLine, guestVisitMenu } from "@/lib/visits/guest-order";
import { anyNonMenuOffering, loadNonMenuOfferingIds, saleHoldsNonMenuOffering } from "./non-menu-offerings";

type Row = Record<string, unknown>;

const TENANT = "t1";
const COFFEE = "c0ffee00-0000-4000-8000-000000000001";
const EVENT_PKG = "e0e0e000-0000-4000-8000-000000000002";
const RESERVATION = "a0a0a000-0000-4000-8000-000000000003";

function offering(id: string, title: string): Row {
  return {
    id, title, amount_cents: 500, kind: "service", inventory_qty: null, capacity_pool_id: null,
    prep_station_id: null, status: "published", moderation_state: "approved", visibility: "public",
    tenant_id: TENANT, owner_kind: "workspace", sort_order: 0,
  };
}

function fake(opts: { failTable?: string } = {}) {
  const tables: Record<string, Row[]> = {
    talent_offerings: [offering(COFFEE, "Coffee"), offering(EVENT_PKG, "NYE ticket package"), offering(RESERVATION, "Table reservation")],
    events: [{ tenant_id: TENANT, offering_id: EVENT_PKG }, { tenant_id: TENANT, offering_id: null }, { tenant_id: "other", offering_id: COFFEE }],
    venue_service_rules: [{ tenant_id: TENANT, reservation_offering_id: RESERVATION }],
    sessions: [],
    talent_offering_variants: [],
    orders: [{ id: "o-event", tenant_id: TENANT }, { id: "o-ok", tenant_id: TENANT }, { id: "o-res", tenant_id: TENANT }],
    order_lines: [{ order_id: "o-event", offering_id: EVENT_PKG }, { order_id: "o-ok", offering_id: COFFEE }, { order_id: "o-res", offering_id: COFFEE }, { order_id: "o-res", offering_id: RESERVATION }],
    visits: [{ id: "v1", tenant_id: TENANT, space_id: "s1", public_token: "tok", status: "open", opened_at: null, party_size: 2 }],
    spaces: [{ id: "s1", code: "T1", name: "Table 1" }],
  };
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain; b.order = chain; b.limit = chain; b.gte = chain; b.in = chain;
    b.eq = (c: string, v: unknown) => { rows = rows.filter((r) => !(c in r) || r[c] === v); return b; };
    b.not = (c: string) => { rows = rows.filter((r) => r[c] != null); return b; };
    b.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    b.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(opts.failTable === table ? { data: null, error: { message: "boom" } } : { data: rows, error: null }).then(ok);
    return b;
  };
  return { from } as never;
}

test("loadNonMenuOfferingIds returns this tenant's event-backing and reservation offerings only", async () => {
  const r = await loadNonMenuOfferingIds(fake(), TENANT);
  assert.equal(r.error, null);
  assert.deepEqual([...r.ids].sort(), [EVENT_PKG, RESERVATION].sort());
});

test("POS counter catalog omits event-backing and reservation offerings, keeps ordinary items", async () => {
  const catalog = await loadCounterCatalog(fake(), { tenantId: TENANT, nowIso: "2026-10-19T00:00:00Z" });
  assert.deepEqual(catalog.items.map((i) => i.id), [COFFEE]);
});

test("POS counter catalog shows nothing when the exclusion list cannot be read (fail closed)", async () => {
  for (const failTable of ["events", "venue_service_rules"]) {
    const catalog = await loadCounterCatalog(fake({ failTable }), { tenantId: TENANT, nowIso: "2026-10-19T00:00:00Z" });
    assert.deepEqual(catalog.items, []);
  }
});

test("QR guest menu omits event-backing and reservation offerings, keeps ordinary items", async () => {
  const menu = await guestVisitMenu(fake(), { tenantId: TENANT, token: "tok" });
  assert.equal(menu.ok, true);
  if (!menu.ok) return;
  assert.deepEqual(menu.items.map((i) => i.id), [COFFEE]);
  assert.equal(menu.items[0].amountCents, 500);
});

test("QR guest menu is unavailable when the exclusion list cannot be read (fail closed)", async () => {
  const menu = await guestVisitMenu(fake({ failTable: "venue_service_rules" }), { tenantId: TENANT, token: "tok" });
  assert.equal(menu.ok, false);
});

const addLine = (admin: never, offeringId: string) =>
  guestVisitAddLine(admin, { tenantId: TENANT, token: "tok", offeringId, qty: 1, actorUserId: "u1" });

test("guestVisitAddLine refuses an event-backing id and a reservation id", async () => {
  for (const id of [EVENT_PKG, RESERVATION]) {
    const r = await addLine(fake(), id);
    assert.deepEqual(r, { ok: false, reason: "item_unavailable" });
  }
});

test("guestVisitAddLine refuses (fails closed) when the exclusion list cannot be read", async () => {
  const r = await addLine(fake({ failTable: "events" }), COFFEE);
  assert.deepEqual(r, { ok: false, reason: "item_unavailable" });
});

test("guestVisitAddLine does not refuse an ordinary item on this ground", async () => {
  const r = await addLine(fake(), COFFEE);
  assert.ok(r.ok || r.reason !== "item_unavailable");
});

test("POS add guard (anyNonMenuOffering): event and reservation ids blocked, ordinary allowed, read error blocks", async () => {
  assert.equal(await anyNonMenuOffering(fake(), TENANT, [EVENT_PKG]), true);
  assert.equal(await anyNonMenuOffering(fake(), TENANT, [RESERVATION]), true);
  assert.equal(await anyNonMenuOffering(fake(), TENANT, [COFFEE]), false);
  assert.equal(await anyNonMenuOffering(fake({ failTable: "venue_service_rules" }), TENANT, [COFFEE]), true);
});

test("POS checkout guard (saleHoldsNonMenuOffering): event or reservation line blocks the sale, ordinary sale passes", async () => {
  assert.equal(await saleHoldsNonMenuOffering(fake(), TENANT, "o-event"), true);
  assert.equal(await saleHoldsNonMenuOffering(fake(), TENANT, "o-res"), true);
  assert.equal(await saleHoldsNonMenuOffering(fake(), TENANT, "o-ok"), false);
  assert.equal(await saleHoldsNonMenuOffering(fake({ failTable: "order_lines" }), TENANT, "o-ok"), true);
  assert.equal(await saleHoldsNonMenuOffering(fake(), TENANT, "missing"), true);
});

test("POS catalog read failure is flagged so the page shows an error, not an empty counter", async () => {
  const bad = await loadCounterCatalog(fake({ failTable: "talent_offerings" }), { tenantId: TENANT, nowIso: "2026-10-19T00:00:00Z" });
  assert.equal(bad.readFailed, true);
  const good = await loadCounterCatalog(fake(), { tenantId: TENANT, nowIso: "2026-10-19T00:00:00Z" });
  assert.equal(good.readFailed, false);
});

test("posAddLine and posStartCollection call the guards; the page renders the error copy in en and es", () => {
  const dir = "src/app/(workspace)/[tenantSlug]/admin/pos/";
  const actions = readFileSync(dir + "actions.ts", "utf8");
  assert.match(actions, /anyNonMenuOffering\(g\.admin, g\.tenantId, \[parsed\.data\.offeringId\]\)/);
  assert.match(actions, /saleHoldsNonMenuOffering\(g\.admin, g\.tenantId, parsed\.data\.orderId\)/);
  assert.match(readFileSync(dir + "page.tsx", "utf8"), /catalog\.readFailed/);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard.pos;
    assert.ok(m.counterCatalogErrorTitle && m.counterCatalogErrorBody);
    assert.ok(!/\u2014/.test(m.counterCatalogErrorTitle + m.counterCatalogErrorBody));
  }
});
