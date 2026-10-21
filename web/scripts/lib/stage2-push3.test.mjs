import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { checkStripeKey } from "./group6-fixtures.mjs";
import { HUB_TENANT_ID } from "./failed-cards-ops.mjs";
import { ALCOHOL_WORD, TEST_WORD, isExampleTestEmail, s2Id, triggerSideEffects, verifyS2Plan } from "./stage2-guards.mjs";
import { PROMO_CODES } from "./stage2-plan-promos.mjs";
import { CATERING_DEPOSIT_CENTS, CATERING_TOTAL } from "./stage2-plan-money.mjs";
import { buildStage2Plan, resolveStage2 } from "./stage2-plan.mjs";
import { EXPORT_FILES, exportV1, exportV2, exportV3 } from "./stage2-restauradmin.mjs";
import { CLOCKS, CONNECT, checkBalanceLivemode, checkStripeSteps, describeS2Stripe, runS2Stripe } from "./stage2-stripe.mjs";
import { parseRestauradminMenu } from "../../src/lib/menu-import/parse-restauradmin.ts";

const NOW = new Date("2026-10-21T12:00:00Z");
const HUB = { talentId: "5f0f0f0f-0000-4000-8000-000000009390", tenantId: HUB_TENANT_ID, hasPayout: false };
const GUARD = { externalTenantIds: new Set([HUB.tenantId]), existingTalentIds: new Set([HUB.talentId]) };
const plan = (only = null) => buildStage2Plan(resolveStage2(only), { now: NOW, has: () => true, hub: HUB });
const ops = (only) => plan(only).ops;
const byKey = (list, key) => list.find((o) => o.key === key);
const rows = (list, table) => list.filter((o) => o.table === table).map((o) => o.row);
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const attrs = (o) => JSON.parse(o.row.attributes ?? "{}");

test("push 3 clusters resolve their dependencies and the whole plan passes its guards", () => {
  assert.deepEqual(resolveStage2(["PR"]), ["T1", "T5", "EV", "PR"]);
  assert.deepEqual(resolveStage2(["CU"]), ["T1", "T3", "T4", "CU"]);
  assert.deepEqual(resolveStage2(["MO"]), ["T1", "T3", "T4", "CU", "MO"]);
  assert.deepEqual(verifyS2Plan(ops(), GUARD).problems, []);
});

test("promos: the codes, the caps, the Monday fixed price, FRIDAY30", () => {
  const list = ops(["PR"]);
  const promo = (k) => byKey(list, `promo:${k}`).row;
  const tenantRows = rows(list, "public.tenant_promo_codes");
  const t1 = tenantRows.filter((p) => p.tenant_id === s2Id("workspace:t1"));
  assert.equal(t1.length, 15);
  const codes = t1.map((p) => p.code).filter(Boolean);
  assert.equal(new Set(codes.map((c) => c.toUpperCase())).size, codes.length, "codes are unique per tenant");
  assert.deepEqual([promo("t1-percent").kind, promo("t1-percent").value], ["percent", 10]);
  assert.deepEqual([promo("t1-fixed").kind, promo("t1-fixed").value, promo("t1-fixed").currency], ["fixed", 5000, "MXN"]);
  assert.deepEqual([promo("t1-race1").max_redemptions, promo("t1-race3").max_redemptions], [1, 3]);
  const monday = promo("t1-lunes-burrito");
  assert.deepEqual([monday.offer_kind, monday.kind, monday.value, monday.weekdays, monday.scope_kind], ["fixed_price", "fixed", 3000, [1], "products"]);
  const mondayTargets = rows(list, "public.promo_targets").filter((t) => t.promo_id === monday.id);
  assert.deepEqual(mondayTargets.map((t) => t.target_id), [s2Id("offering:t1-burrito")]);
  assert.deepEqual([promo("t1-friday30").code, promo("t1-friday30").value, promo("t1-friday30").weekdays], [PROMO_CODES.friday, 30, [5]]);
  for (const p of tenantRows) {
    if (p.kind === "percent") assert.ok(p.value >= 1 && p.value <= 100);
    if (p.kind === "fixed") assert.ok(p.currency && p.value > 0);
    assert.ok(["percent", "fixed"].includes(p.kind) && ["percent", "fixed", "fixed_price"].includes(p.offer_kind));
  }
});

test("automatic promos: 20%, 50% on one item, 30% whole menu capped at 200 and MXN 5,000 with alcohol excluded", () => {
  const list = ops(["PR"]);
  const promo = (k) => byKey(list, `promo:${k}`).row;
  assert.deepEqual([promo("t1-auto20").unlock, promo("t1-auto20").code, promo("t1-auto20").value], ["auto", null, 20]);
  const half = promo("t1-media-hamburguesa");
  assert.deepEqual([half.value, rows(list, "public.promo_targets").filter((t) => t.promo_id === half.id).map((t) => t.target_id)], [50, [s2Id("offering:t1-hamburguesa")]]);
  const menu = promo("t1-menu30");
  assert.deepEqual([menu.value, menu.max_redemptions, menu.budget_cap_cents, menu.unlock], [30, 200, 500000, "auto"]);
  const targetIds = new Set(rows(list, "public.promo_targets").filter((t) => t.promo_id === menu.id).map((t) => t.target_id));
  const offerings = list.filter((o) => o.table === "public.talent_offerings");
  const alcohol = offerings.filter((o) => attrs(o).alcohol === true);
  assert.equal(alcohol.length, 3);
  for (const a of alcohol) assert.equal(targetIds.has(a.id), false, `${a.row.title} must not be a target`);
  const expected = offerings.filter((o) => o.row.tenant_id === s2Id("workspace:t1") && o.row.kind === "product" && o.row.status === "published" && o.row.visibility === "public" && attrs(o).alcohol !== true).map((o) => o.id);
  assert.deepEqual([...targetIds].sort(), expected.sort(), "every published non-alcoholic product, nothing else");
  assert.ok(expected.length >= 13);
  assert.ok(![...targetIds].some((id) => offerings.find((o) => o.id === id && ALCOHOL_WORD.test(o.row.title))));
});

test("O6: every happy-hour / deal promo targets only non-alcoholic deal items", () => {
  const list = ops(["PR"]);
  const offerings = new Map(list.filter((o) => o.table === "public.talent_offerings").map((o) => [o.id, o]));
  for (const k of ["t1-happy", "t5-happy"]) {
    const p = byKey(list, `promo:${k}`).row;
    assert.equal(p.value, 50);
    assert.deepEqual(p.weekdays, [1, 2, 3, 4, 5]);
    assert.ok(p.time_from < p.time_to);
    const targets = rows(list, "public.promo_targets").filter((t) => t.promo_id === p.id);
    assert.equal(targets.length, 2);
    for (const t of targets) {
      const o = offerings.get(t.target_id);
      assert.ok(o, "target is a planned offering");
      assert.deepEqual([attrs(o).deal, attrs(o).alcohol], [true, false]);
      assert.equal(ALCOHOL_WORD.test(o.row.title), false);
    }
    assert.equal(p.tenant_id, offerings.get(targets[0].target_id).row.tenant_id, "the promo and its items share a tenant");
  }
});

test("promo states and scopes: paused, expired, paid-plan-only, variant-scoped, one legacy event_id row", () => {
  const list = ops(["PR"]);
  const promo = (k) => byKey(list, `promo:${k}`).row;
  assert.equal(promo("t1-paused").is_paused, true);
  assert.ok(Date.parse(promo("t1-expired").ends_at) < NOW.getTime() && Date.parse(promo("t1-expired").starts_at) < Date.parse(promo("t1-expired").ends_at));
  const paid = promo("t1-nuevos");
  assert.deepEqual([paid.audience, paid.unlock, paid.ends_at], ["new_clients", "auto", undefined], "an audience promo with no end date can only be live on a paid plan");
  const vip = promo("t1-vip-dj");
  assert.deepEqual([vip.event_id, vip.variant_id], [s2Id("event:dj"), s2Id("variant:dj-vip")]);
  const legacy = promo("t1-legacy-event");
  assert.equal(legacy.event_id, s2Id("event:dj"));
  assert.equal(legacy.variant_id, undefined);
  assert.equal(list.filter((o) => o.table === "public.tenant_promo_codes" && o.row.event_id && !o.row.variant_id).length, 1, "exactly one legacy event_id row");
  assert.equal(list.some((o) => o.table === "public.tenant_promo_codes" && o.row.talent_profile_id), false, "no hub/talent promos");
});

test("customers: the identities of the card, all @example.test, with the model's limits stated", () => {
  const list = ops(["CU"]);
  const cust = (k) => byKey(list, `customer:${k}`).row;
  const all = rows(list, "public.customers");
  assert.ok(all.every((c) => isExampleTestEmail(c.email)));
  assert.equal(cust("guest").user_id, undefined, "a guest with no account");
  assert.equal(cust("verified").user_id, s2Id("user:c-verified"));
  assert.equal(byKey(list, "user:c-verified").row.confirmed, true);
  // household: one phone, different emails (the unique index allows the phone on one row only)
  assert.notEqual(cust("hh-1").email, cust("hh-2").email);
  assert.equal(all.filter((c) => c.tenant_id === s2Id("workspace:t1") && c.phone_e164 === cust("hh-1").phone_e164).length, 1);
  assert.match(cust("hh-2").notes, /Shares the phone \+529981230001/);
  // same email, agency pool (T3) and salon pool (T4)
  assert.equal(cust("shared-agency").email, cust("shared-salon").email);
  assert.deepEqual([cust("shared-agency").tenant_id, cust("shared-salon").tenant_id], [s2Id("workspace:t3"), s2Id("workspace:t4")]);
  // unsubscribe row: natural key, example.test only
  const unsub = byKey(list, "unsub:c-unsub");
  assert.equal(unsub.natural, "email_normalized");
  assert.ok(isExampleTestEmail(unsub.row.email_normalized) && unsub.row.unsubscribed_at);
  assert.equal(unsub.id, null);
  assert.equal(cust("unsub").email, unsub.row.email_normalized);
  // account deletion: pending and already past its 14-day grace
  const del = byKey(list, "deletion:c-delete").row;
  assert.deepEqual([del.status, del.surface, del.user_id], ["pending", "client", s2Id("user:c-delete")]);
  assert.ok(Date.parse(del.requested_at) + 14 * 86400000 < NOW.getTime());
  // WhatsApp suppression: reported as blocked, never faked
  const p = plan(["CU"]);
  assert.ok(p.blocked.some((b) => /WhatsApp/.test(b.item)));
  assert.equal(p.ops.some((o) => /whatsapp/i.test(o.table)), false);
});

test("money: only the catering offer is pre-made; paid history is created live in Stripe TEST", () => {
  const list = ops(["MO"]).filter((o) => o.fx === "MO");
  const tables = new Set(list.map((o) => o.table));
  assert.deepEqual([...tables].sort(), ["public.inquiries", "public.inquiry_offer_line_items", "public.inquiry_offers", "public.inquiry_participants", "public.inquiry_requirement_groups"]);
  for (const t of ["public.orders", "public.order_lines", "public.admissions", "public.payments", "public.refunds", "public.agency_bookings", "public.talent_bookings"]) assert.equal(tables.has(t), false, t);
  const offer = byKey(list, "offer:t1-catering").row;
  assert.deepEqual([offer.status, offer.deposit_pct, offer.currency_code, offer.total_client_price], ["sent", 30, "MXN", CATERING_TOTAL]);
  assert.equal(offer.deposit_amount_cents, CATERING_DEPOSIT_CENTS);
  assert.equal(CATERING_DEPOSIT_CENTS, Math.round(CATERING_TOTAL * 100 * 0.3));
  const line = byKey(list, "offer_line:t1-catering").row;
  assert.deepEqual([line.talent_profile_id, line.owner_tenant_id, line.source_service_id], [null, s2Id("workspace:t1"), s2Id("offering:t1-tacos-exp")]);
  const parts = rows(list, "public.inquiry_participants");
  assert.deepEqual(parts.map((p) => p.role ?? "client").sort(), ["client", "house"]);
  const house = parts.find((p) => p.role === "house");
  assert.deepEqual([house.talent_profile_id, house.user_id, house.owning_party_type, house.owning_party_id], [null, null, "workspace", s2Id("workspace:t1")]);
  const inquiry = byKey(list, "inquiry:t1-catering");
  assert.ok(isExampleTestEmail(inquiry.row.contact_email));
  const upd = byKey(list, "inquiry:t1-catering:offer");
  assert.deepEqual([upd.kind, upd.id, upd.set.current_offer_id], ["update", inquiry.id, offer.id], "the update targets this seed's own inquiry");
  assert.ok(list.indexOf(upd) > list.indexOf(byKey(list, "offer:t1-catering")), "the pointer is set after the offer exists");
});

test("trigger side effects are counted from the plan", () => {
  const list = ops();
  const fx = Object.fromEntries(triggerSideEffects(list).map((t) => [t.table, t.rows]));
  const users = list.filter((o) => o.kind === "authUser").length;
  assert.equal(fx["public.profiles"], users);
  assert.equal(fx["auth.identities"], users);
  assert.equal(fx["public.agency_talent_roster"], 3, "3 fixture talents (TAL-96201..03)");
  assert.equal(fx["public.agencies (takes_reservations flag)"], 1);
});

test("Stripe step: TEST only, livemode proof, idempotent, nothing printed", async () => {
  assert.equal(checkStripeKey("sk_test_abc123").ok, true);
  for (const bad of ["sk_live_abc", "rk_live_abc", "rk_test_abc", "pk_test_abc", "", null]) assert.equal(checkStripeKey(bad).ok, false, String(bad));
  assert.equal(checkBalanceLivemode({ livemode: false }).ok, true);
  assert.equal(checkBalanceLivemode({ livemode: true }).ok, false);
  assert.equal(checkBalanceLivemode({}).ok, false);
  assert.equal(checkStripeSteps(["T1", "T4", "CLOCKS"]).ok, true);
  assert.equal(checkStripeSteps(["S6"]).ok, false);

  const created = [];
  const mk = (platform, existing = []) => ({
    accounts: { list: async () => ({ data: existing }), create: async (args, opts) => { created.push({ platform, args, opts }); return { id: `acct_${platform}_new` }; } },
    testHelpers: { testClocks: { list: async () => ({ data: [] }), create: async (args) => { created.push({ platform, clock: args }); return { id: `clock_${created.length}`, frozen_time: args.frozen_time }; } } },
  });
  const updates = [];
  const logs = [];
  const q = async () => ({ rows: [{ stripe_account_id: null }] });
  const updateOwned = async (table, id, set) => updates.push({ table, id, set });
  await runS2Stripe(["T1", "T4", "CLOCKS"], { us: mk("us"), mx: mk("mx") }, { q, updateOwned, log: (m) => logs.push(m) });
  const accounts = created.filter((c) => c.args?.type === "express");
  assert.deepEqual(accounts.map((a) => [a.platform, a.args.country]), [["mx", "MX"], ["us", "US"]]);
  assert.ok(accounts.every((a) => a.args.metadata.seed === "s2-stage2-fixtures" && a.opts.idempotencyKey.startsWith("s2-stage2-fixtures_connect_")));
  assert.deepEqual(updates.map((u) => [u.table, u.id, u.set.stripe_account_platform]), [["public.agencies", s2Id("workspace:t1"), "mx"], ["public.agencies", s2Id("workspace:t4"), "us"]]);
  assert.equal(created.filter((c) => c.clock).length, CLOCKS.length);
  assert.ok(logs.every((l) => !/sk_|whsec_|secret/i.test(l)));
  // reuse: a row that already has an account id is never touched; a missing key skips
  const q2 = async () => ({ rows: [{ stripe_account_id: "acct_existing" }] });
  updates.length = 0;
  await runS2Stripe(["T1", "T4"], { us: mk("us"), mx: mk("mx") }, { q: q2, updateOwned, log: () => {} });
  assert.equal(updates.length, 0);
  const logs2 = [];
  await runS2Stripe(["T1"], { us: mk("us"), mx: null }, { q, updateOwned, log: (m) => logs2.push(m) });
  assert.ok(logs2.some((l) => /SKIPPED/.test(l)));
  assert.ok(describeS2Stripe(["T1", "T4", "CLOCKS"], { usKey: true, mxKey: false, accounts: {}, clocks: {} }).some((l) => l.startsWith("SKIP T1")));
  assert.deepEqual(Object.keys(CONNECT), ["T1", "T4"]);
  // The runner refuses the Stripe step outside --apply/plan, and never during selftest/cleanup.
  const source = readFileSync(new URL("../seed-stage2-fixtures.mts", import.meta.url), "utf8");
  assert.match(source, /openTestStripe\(Stripe, stripeKey\)/);
  assert.match(source, /never runs with --selftest or --cleanup/);
  assert.match(source, /if \(stripeSteps\.length\) await stripeApply\(\)/);
  assert.ok(source.indexOf("await q(\"commit\");\n    console.log(`${TAG} COMMITTED") < source.indexOf("await stripeApply()"), "Stripe runs after the database commit, separately");
});

test("RestaurAdmin exports v1 / v2 / v3: committed files match the generator, parse with the app's importer, v2 changes 3 prices, v3 drops one dish", () => {
  for (const [path, build] of Object.entries(EXPORT_FILES)) {
    assert.deepEqual(JSON.parse(readFileSync(join(REPO, path), "utf8")), build(), `${path} is stale: regenerate`);
  }
  const m1 = parseRestauradminMenu(exportV1());
  const m2 = parseRestauradminMenu(exportV2());
  const m3 = parseRestauradminMenu(exportV3());
  assert.deepEqual([m1.currency, m1.defaultLocale, m1.items.length, m1.refused.length], ["MXN", "es", 6, 0]);
  assert.equal(m1.items.find((i) => i.sourceId === "restauradmin:p-sopes").variants.length, 2);
  assert.deepEqual(m1.items.find((i) => i.sourceId === "restauradmin:p-sopes").variants.map((v) => v.label), ["Orden de 3", "Orden de 5"]);
  assert.equal(m1.items.find((i) => i.sourceId === "restauradmin:p-alambre").addOns.length, 1);
  assert.equal(m1.counts.tierLabelsMissing, 0);
  const money = (m) => Object.fromEntries(m.items.map((i) => [i.sourceId, JSON.stringify([i.amountCents, i.variants.map((v) => v.amountCents)])]));
  const a = money(m1);
  const b = money(m2);
  assert.deepEqual(Object.keys(a), Object.keys(b), "same dishes, same source ids");
  assert.deepEqual(Object.keys(a).filter((k) => a[k] !== b[k]).sort(), ["restauradmin:p-alambre", "restauradmin:p-sopes", "restauradmin:p-tamarindo"]);
  assert.deepEqual(Object.keys(b).filter((k) => !(k in money(m3))), ["restauradmin:p-torta"]);
  assert.equal(m3.items.length, 5);
  assert.deepEqual(Object.fromEntries(Object.entries(money(m3))), Object.fromEntries(Object.entries(b).filter(([k]) => k !== "restauradmin:p-torta")));
  const text = JSON.stringify([exportV1(), exportV2(), exportV3()]);
  assert.equal(TEST_WORD.test(text), false);
  assert.equal(ALCOHOL_WORD.test(text), false);
  assert.equal(/sk_(live|test)_|whsec_|password|@/i.test(text), false, "no secret, no email");
});
