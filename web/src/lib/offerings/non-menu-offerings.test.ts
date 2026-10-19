/**
 * TUL-1271 item 6: event-backing and reservation offerings never reach the POS
 * counter catalog or the QR guest menu; ordinary items still do.
 * Lane: `npm run test:money`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadCounterCatalog } from "@/app/(workspace)/[tenantSlug]/admin/pos/counter-catalog";
import { guestVisitMenu } from "@/lib/visits/guest-order";
import { loadNonMenuOfferingIds } from "./non-menu-offerings";

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
