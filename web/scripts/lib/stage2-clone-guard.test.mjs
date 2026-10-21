import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { HUB_TENANT_ID } from "./failed-cards-ops.mjs";
import { G6, CLONE_TENANT_COLUMNS, clone, s2Id } from "./stage2-ops.mjs";
import { buildStage2Plan, resolveStage2 } from "./stage2-plan.mjs";

const NOW = new Date("2026-10-21T12:00:00Z");
const HUB = { talentId: "5f0f0f0f-0000-4000-8000-000000009390", tenantId: HUB_TENANT_ID, hasPayout: false };
const all = () => buildStage2Plan(resolveStage2(null), { now: NOW, has: () => true, hub: HUB }).ops;
const MIGRATIONS = join(fileURLToPath(new URL("../../../", import.meta.url)), "supabase/migrations");

test("a clone must set every tenant column explicitly; an unlisted table cannot be cloned", () => {
  const ws = s2Id("workspace:t1");
  const ok = { id: s2Id("x"), inquiry_id: s2Id("i"), tenant_id: ws };
  assert.doesNotThrow(() => clone("X", "public.inquiry_offers", "offer:x", G6.offerSent, ok));
  assert.throws(() => clone("X", "public.inquiry_offers", "offer:x", G6.offerSent, { id: s2Id("x"), inquiry_id: s2Id("i") }), /tenant_id must be set explicitly/);
  assert.throws(() => clone("X", "public.inquiry_offer_line_items", "line:x", G6.offerLine, { id: s2Id("l"), offer_id: s2Id("o"), tenant_id: ws }), /owner_tenant_id must be set explicitly/);
  assert.throws(() => clone("X", "public.inquiries", "inq:x", G6.inqOffer, { id: s2Id("i"), tenant_id: ws }), /source_workspace_id must be set explicitly/);
  assert.throws(() => clone("X", "public.inquiry_messages", "m:x", G6.msgText, { id: s2Id("m"), tenant_id: ws }), /no entry in CLONE_TENANT_COLUMNS/);
  assert.throws(() => clone("X", "public.inquiry_offers", "offer:x", G6.offerSent, { id: s2Id("x"), tenant_id: undefined }), /must be set explicitly/);
});

test("every cloned row in the plan lives in a fixture workspace, never in a Group-6 or hub tenant", () => {
  const list = all();
  const fixtureTenants = new Set(list.filter((o) => o.table === "public.agencies" && o.kind === "clone").map((o) => o.id));
  const templateTenants = new Set([G6.ws, HUB_TENANT_ID]);
  const clones = list.filter((o) => o.kind === "clone");
  assert.ok(clones.length > 20);
  for (const o of clones) {
    for (const col of CLONE_TENANT_COLUMNS[o.table]) {
      const v = o.row[col];
      assert.ok(fixtureTenants.has(v), `${o.key}.${col} = ${v} is not a fixture workspace`);
      assert.equal(templateTenants.has(v), false, `${o.key}.${col} carries a template tenant`);
    }
    for (const [col, v] of Object.entries(o.row)) if (/tenant/.test(col) && typeof v === "string") assert.equal(templateTenants.has(v), false, `${o.key}.${col}`);
  }
});

test("tenant_autofill_* triggers: a child row carries exactly its parent's tenant (the check that failed in the selftest)", () => {
  const list = all();
  const byId = new Map(list.filter((o) => o.id && (o.kind === "insert" || o.kind === "clone")).map((o) => [o.id, o]));
  // child table -> [parent id column, parent table]; from migration 20260607100000 (BEFORE INSERT, raises on mismatch).
  const CHILD = {
    "public.inquiry_participants": ["inquiry_id", "public.inquiries"],
    "public.inquiry_requirement_groups": ["inquiry_id", "public.inquiries"],
    "public.inquiry_offers": ["inquiry_id", "public.inquiries"],
    "public.inquiry_offer_line_items": ["offer_id", "public.inquiry_offers"],
    "public.booking_talent": ["booking_id", "public.agency_bookings"], // tenant_autofill_booking_talent (SL/RV/PO content cluster)
  };
  let checked = 0;
  for (const o of list) {
    const rule = CHILD[o.table];
    if (!rule) continue;
    const parent = byId.get(o.row[rule[0]]);
    assert.ok(parent && parent.table === rule[1], `${o.key}: parent ${rule[1]} is planned`);
    assert.equal(typeof o.row.tenant_id, "string", `${o.key} sets tenant_id`);
    assert.equal(o.row.tenant_id, parent.row.tenant_id, `${o.key}.tenant_id equals ${parent.key}.tenant_id`);
    checked += 1;
  }
  assert.ok(checked >= 5);
  // Every autofill trigger on main that targets a table this plan inserts into is covered by CHILD (a new one fails here).
  const planned = new Set(list.map((o) => o.table));
  const found = new Set();
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    for (const m of sql.matchAll(/CREATE TRIGGER\s+\w*autofill\w*\s+BEFORE INSERT ON\s+(public\.\w+)/gi)) found.add(m[1]);
  }
  assert.ok(found.has("public.inquiry_offers"), "the migration scan found the trigger from the selftest failure");
  // agency_bookings derives its tenant ONLY from source_inquiry_id; the history bookings have none and set tenant_id explicitly (guard: contentRowProblems).
  const SELF_TENANT = new Set(["public.agency_bookings"]);
  for (const o of list.filter((x) => x.table === "public.agency_bookings")) assert.ok(o.row.source_inquiry_id == null && typeof o.row.tenant_id === "string", `${o.key} sets its own tenant`);
  for (const t of found) if (planned.has(t) && !SELF_TENANT.has(t)) assert.ok(CHILD[t], `${t} has a tenant_autofill trigger but no rule in this test`);
});

test("trg_inquiries_status_offer_pair (20260520103600): a sent offer pairs with status offer_pending, never with the cloned 'coordination'", () => {
  const list = all();
  const inquiry = list.find((o) => o.key === "inquiry:t1-catering");
  const offer = list.find((o) => o.key === "offer:t1-catering");
  const upd = list.find((o) => o.key === "inquiry:t1-catering:offer");
  assert.equal(inquiry.row.current_offer_id, null, "inserted without an offer pointer");
  assert.notEqual(inquiry.row.status, "offer_pending", "inserted in a status that needs no offer");
  assert.equal(offer.row.status, "sent");
  assert.deepEqual([upd.set.status, upd.set.current_offer_id], ["offer_pending", offer.id], "pointer and status move together, after the offer exists");
  assert.ok(list.indexOf(upd) > list.indexOf(offer));
  assert.equal(list.filter((o) => o.table === "public.inquiry_offers").length, 1, "inquiry_offers_one_active_offer: one live offer per inquiry");
});
