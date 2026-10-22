import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { guestVisitAddLine, guestVisitMenu } from "./guest-order";

const TENANT = "11111111-1111-4111-8111-111111111111";
const DISH = "22222222-2222-4222-8222-222222222222";
const BASE = "33333333-3333-4333-8333-333333333333";

function fake(variantsError = false) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    talent_offerings: [
      { id: DISH, title: "Michelada", amount_cents: null, prep_station_id: null, status: "published", moderation_state: "approved", visibility: "public", tenant_id: TENANT, sort_order: 0 },
      { id: BASE, title: "Agua", amount_cents: 3000, prep_station_id: null, status: "published", moderation_state: "approved", visibility: "public", tenant_id: TENANT, sort_order: 1 },
    ],
    events: [],
    venue_service_rules: [],
    sessions: [],
    talent_offering_variants: [
      { id: "v-l", offering_id: DISH, label: "Grande", amount_cents: 9000, is_hidden: false, sort_order: 2 },
      { id: "v-s", offering_id: DISH, label: "Chico", amount_cents: 6000, is_hidden: false, sort_order: 1 },
      { id: "v-h", offering_id: DISH, label: "Oculto", amount_cents: 1, is_hidden: true, sort_order: 3 },
    ],
    visits: [{ id: "v1", tenant_id: TENANT, space_id: "s1", public_token: "tok", status: "open", opened_at: null, party_size: 2 }],
    spaces: [{ id: "s1", code: "T1", name: "Table 1" }],
    // TUL-1348 retest: a staff order plus the guest's own draft is two orders on one visit.
    orders: [
      { id: "o-staff", visit_id: "v1", tenant_id: TENANT, currency: "MXN", total_cents: 0, status: "draft", created_at: "2026-01-01T10:00:00Z" },
      { id: "o-guest", visit_id: "v1", tenant_id: TENANT, currency: "MXN", total_cents: 9000, status: "draft", created_at: "2026-01-01T10:05:00Z" },
    ],
    order_lines: [{ id: "l1", order_id: "o-guest", label: "Michelada Grande", units: 1, total_cents: 9000, sort_order: 0 }],
  };
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain; b.limit = chain; b.gte = chain; b.not = chain;
    b.in = (c: string, vals: unknown[]) => { rows = rows.filter((r) => !(c in r) || vals.includes(r[c])); return b; };
    b.order = (c: string) => { rows = [...rows].sort((a, z) => Number(a[c] ?? 0) - Number(z[c] ?? 0)); return b; };
    b.eq = (c: string, v: unknown) => { rows = rows.filter((r) => !(c in r) || r[c] === v); return b; };
    b.neq = (c: string, v: unknown) => { rows = rows.filter((r) => !(c in r) || r[c] !== v); return b; };
    b.maybeSingle = async () => ({ data: rows.length > 1 ? null : (rows[0] ?? null), error: rows.length > 1 ? { code: "PGRST116" } : null });
    b.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(variantsError && table === "talent_offering_variants" ? { data: null, error: { message: "boom" } } : { data: rows, error: null }).then(ok);
    return b;
  };
  return { from } as never;
}

test("the QR menu returns each dish's visible options in order; no base price stays null, never 0", async () => {
  const menu = await guestVisitMenu(fake(), { tenantId: TENANT, token: "tok" });
  assert.equal(menu.ok, true);
  if (!menu.ok) return;
  const dish = menu.items.find((i) => i.id === DISH)!;
  assert.equal(dish.amountCents, null);
  assert.deepEqual(dish.options.map((o) => o.label), ["Chico", "Grande"]);
  const agua = menu.items.find((i) => i.id === BASE)!;
  assert.equal(agua.amountCents, 3000);
  assert.deepEqual(agua.options, []);
});

test("an unreadable options table hides the menu (fail closed)", async () => {
  const menu = await guestVisitMenu(fake(true), { tenantId: TENANT, token: "tok" });
  assert.equal(menu.ok, false);
});

test("the client sends the chosen variant and asks before adding an option-priced dish", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/visit/[token]/menu/menu-client.tsx"), "utf8");
  assert.match(src, /variantId: optionId/);
  assert.match(src, /setPicking\(open \? null : item\.id\)/);
  assert.match(src, /oc\.choose/);
});

test("a guest who posts a HIDDEN variant id is refused and nothing is added", async () => {
  // The fake has no insert/update/rpc: any attempt to create a draft or add a
  // line would throw, so a clean refusal also proves nothing was written.
  const admin = fake();
  const base = { tenantId: TENANT, token: "tok", offeringId: DISH, qty: 1, actorUserId: "u1" };
  const hidden = await guestVisitAddLine(admin, { ...base, variantId: "v-h" });
  assert.deepEqual(hidden, { ok: false, reason: "item_unavailable" });
  const foreign = await guestVisitAddLine(admin, { ...base, variantId: "v-nope" });
  assert.deepEqual(foreign, { ok: false, reason: "item_unavailable" });
});

test("the gate runs in the guest path before any draft is created", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/visits/guest-order.ts"), "utf8");
  const gate = src.indexOf("guestVariantSellable(v, off.id");
  assert.ok(gate > 0 && gate < src.indexOf("await guestDraft(admin"));
});

test("TUL-1348: after a size is added the visit holds two orders and the menu still loads (no 404)", async () => {
  const menu = await guestVisitMenu(fake(), { tenantId: TENANT, token: "tok" });
  assert.equal(menu.ok, true);
  const { loadOpenVisitByToken } = await import("./qr");
  const visit = await loadOpenVisitByToken(fake(), { tenantId: TENANT, publicToken: "tok" });
  assert.equal(visit.ok, true);
  if (visit.ok) assert.equal(visit.totalCents, 9000);
});
