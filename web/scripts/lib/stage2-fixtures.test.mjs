import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { G6, HUB_TENANT_ID } from "./failed-cards-ops.mjs";
import { fcId } from "./failed-cards-guards.mjs";
import {
  ALCOHOL_WORD, alcoholDealProblems, checkS2Plan, checkS2Target, isExampleTestEmail, publicCopyProblems, s2Id, summarise, verifyS2Plan,
} from "./stage2-guards.mjs";
import { HELD } from "./stage2-plan-t1-catalog.mjs";
import { T1_STAFF, T1_WS } from "./stage2-plan-t1.mjs";
import { S2_FIXTURES, buildStage2Plan, resolveStage2 } from "./stage2-plan.mjs";
import { SEED_CONFIG_PATH, loadSeedConfig, parseSeedConfig, pinName, pwName, resolveSecrets, writeSeedConfig } from "./stage2-secrets.mjs";

const STAGING = "postgresql://postgres.fxlankepwnvelxjrahwk:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
const PROD = "postgresql://postgres.pluhdapdnuiulvxmyspd:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
const NOW = new Date("2026-10-21T12:00:00Z");
const HUB = { talentId: "5f0f0f0f-0000-4000-8000-000000009390", tenantId: HUB_TENANT_ID, hasPayout: false };
const GUARD = { externalTenantIds: new Set([HUB.tenantId]), existingTalentIds: new Set([HUB.talentId]) };
const verify = (list) => verifyS2Plan(list, GUARD);
const plan = (has = () => true, now = NOW, only = null, hub = HUB) => buildStage2Plan(resolveStage2(only), { now, has, hub });
const ops = (...a) => plan(...a).ops;
const byKey = (list, key) => list.find((o) => o.key === key);
const source = readFileSync(new URL("../seed-stage2-fixtures.mts", import.meta.url), "utf8");
const WEB = fileURLToPath(new URL("../../", import.meta.url));

test("ids are deterministic (s2Id of the key), unique, and outside the Group-6 and #4048 id spaces", () => {
  const a = ops(() => true, NOW);
  const b = ops(() => true, new Date("2027-02-01T00:00:00Z"));
  assert.deepEqual(a.map((o) => o.id), b.map((o) => o.id), "same ids on every run (a re-run is a no-op)");
  const ids = a.filter((o) => o.id && o.kind !== "update" && o.kind !== "pin").map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(a.length > 100);
  for (const o of a) if (o.id && !["update", "pin", "authUser"].includes(o.kind)) assert.equal(o.id, s2Id(o.key), `${o.table} ${o.key}`);
  const g6 = new Set(Object.values(G6));
  assert.ok(ids.every((id) => !g6.has(id)));
  assert.notEqual(s2Id("workspace:t1"), fcId("workspace:t1"));
  assert.deepEqual(verify(a).problems, []);
  assert.deepEqual(verify(ops(() => false)).problems, []);
});

test("every cluster is built, and the build says what it did not seed", () => {
  assert.deepEqual(S2_FIXTURES, ["T1", "T2", "T3", "T4", "T5", "EV", "PR", "CU", "MO"]);
  const p = plan();
  assert.ok(p.notBuilt.length >= 3);
  assert.ok(p.notBuilt.every((n) => n.id && n.what && n.why));
  assert.deepEqual(plan(() => true, NOW, ["T2"]).ops.filter((o) => o.fx === "T1"), []);
});

test("guards: production, pluhda, qa-1..qa-6, TAL-93938 and every other talent are refused", () => {
  assert.equal(checkS2Target({ DATABASE_URL: STAGING }).ok, true);
  assert.equal(checkS2Target({ DATABASE_URL: PROD }).ok, false);
  assert.equal(checkS2Target({ DATABASE_URL: STAGING, NEXT_PUBLIC_SUPABASE_URL: "https://pluhdapdnuiulvxmyspd.supabase.co" }).ok, false);
  assert.equal(checkS2Target({ DATABASE_URL: "postgresql://postgres:pw@db.fxlankepwnvelxjrahwk.supabase.co:5432/postgres" }).ok, false);
  assert.equal(JSON.stringify(checkS2Target({ DATABASE_URL: PROD })).includes(":pw@"), false, "never echoes the secret");
  const base = ops();
  const ws = base.find((o) => o.key === "workspace:t1");
  const item = base.find((o) => o.key === "offering:t1-burrito");
  const bad = (patch, label) => {
    const mutated = base.map((o) => (o === item ? { ...o, row: { ...o.row, ...patch } } : o));
    const v = verify(mutated);
    assert.equal(v.ok, false, label);
    return v.problems.join(" | ");
  };
  assert.match(bad({ description: "see pluhdapdnuiulvxmyspd" }, "pluhda"), /pluhda/i);
  assert.match(bad({ description: "open qa-3.tulala.digital" }, "qa host"), /qa-1\.\.qa-6/);
  assert.match(bad({ description: "qa-1" }, "qa-1"), /qa-1\.\.qa-6/);
  assert.match(bad({ description: "copy of TAL-93938" }, "TAL-93938"), /TAL-93938/);
  assert.match(bad({ description: "talent TAL-93940" }, "other talent"), /only TAL-93900/);
  assert.match(bad({ description: "talent TAL-12345" }, "other talent 2"), /only TAL-93900/);
  assert.deepEqual(verify(base.map((o) => (o === item ? { ...o, row: { ...o.row, description: "hub talent TAL-93900" } } : o))).problems.filter((p) => /TAL-/.test(p)), [], "TAL-93900 is the one allowed code");
  assert.match(bad({ tenant_id: "00000000-0000-0000-0000-00000000dead" }, "foreign tenant"), /not a fixture tenant/);
  assert.equal(checkS2Plan([{ fx: "X", kind: "update", table: "public.talent_offerings", key: "u", id: G6.t1, set: { title: "x" } }], { fixtureIds: new Set() }).ok, false, "update on a non-fixture row");
  assert.equal(checkS2Plan([{ fx: "X", kind: "insert", table: "public.talent_profiles", key: "t", id: s2Id("t"), row: { profile_code: "TAL-96999" } }], { fixtureIds: new Set([s2Id("t")]) }).ok, false, "no talent profile is ever inserted");
  assert.ok(ws);
});

test("@example.test mailboxes only, and every slug / host / link code / event slug starts with s2-", () => {
  const list = ops();
  assert.equal(isExampleTestEmail("s2-t1-owner@example.test"), true);
  for (const bad of ["a@gmail.com", "a@example.com", "a@impronta.test", "x@example.test.evil.com", "tulalaqa+x@mail.grokbot.com"]) assert.equal(isExampleTestEmail(bad), false, bad);
  const emails = list.filter((o) => o.kind === "authUser").map((o) => o.row.email);
  assert.equal(emails.length, T1_STAFF.length + 2 + 3 + 3 + 2 + 2);
  assert.ok(emails.every(isExampleTestEmail));
  assert.ok(JSON.stringify(list).match(/@[a-z0-9.-]+/g).every((m) => m === "@example.test"));
  const slugs = list.flatMap((o) => ["slug", "hostname", "tenant_slug", "code"].map((c) => (o.table === "public.links" || c !== "code" ? o.row?.[c] : undefined)).filter(Boolean));
  assert.ok(slugs.length > 15 && slugs.every((s) => String(s).startsWith("s2-")), slugs.filter((s) => !String(s).startsWith("s2-")).join(","));
  const mutated = list.map((o) => (o.key === "workspace:t1" ? { ...o, row: { ...o.row, slug: "impronta" } } : o));
  assert.equal(verify(mutated).ok, false);
  const badMail = list.map((o) => (o.key === "user:t1-owner" ? { ...o, row: { ...o.row, email: "owner@gmail.com" } } : o));
  assert.equal(verify(badMail).ok, false);
});

test("O6: no alcohol in any deal item; the beers and the margarita are gated control items with non-alcoholic counterparts", () => {
  const list = ops();
  assert.deepEqual(alcoholDealProblems(list), []);
  const attrs = (o) => JSON.parse(o.row.attributes);
  const deals = list.filter((o) => o.table === "public.talent_offerings" && attrs(o).deal === true);
  assert.ok(deals.filter((o) => o.row.tenant_id === T1_WS).length >= 2, "a non-alcoholic counterpart for each 2x1 story");
  assert.ok(deals.every((o) => attrs(o).alcohol === false && !ALCOHOL_WORD.test(o.row.title)));
  const controls = list.filter((o) => o.table === "public.talent_offerings" && attrs(o).alcohol === true);
  assert.deepEqual(controls.map((o) => o.row.title).sort(), ["Cerveza clara", "Cerveza oscura", "Margarita"]);
  assert.ok(controls.every((o) => attrs(o).excluded_from_deals === true && attrs(o).deal === undefined));
  const mutated = list.map((o) => (o.key === "offering:t1-limonada" ? { ...o, row: { ...o.row, title: "Margarita 2x1" } } : o));
  assert.equal(alcoholDealProblems(mutated).length, 1);
  const flagged = list.map((o) => (o.key === "offering:t1-jamaica" ? { ...o, row: { ...o.row, attributes: JSON.stringify({ deal: true, alcohol: true }) } } : o));
  assert.equal(alcoholDealProblems(flagged).length, 1);
});

test("no public title, name, label, description or category says QA / test / E2E", () => {
  const list = ops();
  assert.deepEqual(publicCopyProblems(list), []);
  const scanned = list.filter((o) => o.table === "public.talent_offerings" || o.table === "public.talent_offering_variants" || o.table === "public.venues");
  assert.ok(scanned.length > 30);
  const mutated = list.map((o) => (o.key === "offering:t1-burrito" ? { ...o, row: { ...o.row, title: "QA Burrito" } } : o));
  assert.equal(publicCopyProblems(mutated).length, 1);
  const names = list.filter((o) => o.kind === "update" && o.table === "public.profiles").map((o) => o.set.display_name);
  assert.ok(names.length === T1_STAFF.length + 2 + 3 + 3 + 2 + 2);
});

test("credentials: generated, written only to a gitignored mode-600 local file, never in the plan, rows, logs or backups", () => {
  const list = ops();
  const secrets = resolveSecrets(list);
  const users = list.filter((o) => o.kind === "authUser");
  assert.equal([...secrets.keys()].filter((k) => k.startsWith("S2_PW_")).length, users.length);
  assert.ok(secrets.has(pinName("t1-manager")));
  assert.match(secrets.get(pinName("t1-manager")), /^\d{4}$/);
  assert.ok([...secrets.values()].every((v) => v.length >= 4));
  assert.equal(new Set([...secrets].filter(([k]) => k.startsWith("S2_PW_")).map(([, v]) => v)).size, users.length, "a password per login");
  // Not in any op, and not derivable from the plan text.
  const text = JSON.stringify(list);
  for (const [k, v] of secrets) if (k.startsWith("S2_PW_")) assert.equal(text.includes(v), false, k);
  assert.equal(list.flatMap((o) => Object.keys(o.row ?? {})).some((k) => /^(encrypted_)?password$/i.test(k)), false);
  assert.ok(users.every((o) => o.row.secretKey && Object.keys(o.row).filter((k) => /pass|secret|token/i.test(k)).join() === "secretKey"));
  // Re-running keeps existing values.
  const again = resolveSecrets(list, new Map([[pwName("t1-owner"), "keep-me-123456"]]));
  assert.equal(again.get(pwName("t1-owner")), "keep-me-123456");
  // The file: mode 600, round-trips, and an unsafe file is refused.
  const dir = mkdtempSync(join(tmpdir(), "s2-seed-"));
  const file = join(dir, ".env.stage2-seed.local");
  writeSeedConfig(secrets, file);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(parseSeedConfig(readFileSync(file, "utf8")).get(pinName("t1-manager")), secrets.get(pinName("t1-manager")));
  assert.equal(loadSeedConfig(join(dir, "missing")).size, 0);
  chmodSync(file, 0o644);
  assert.throws(() => loadSeedConfig(file), /mode must be 600/);
  // The default path is under web/ and git ignores it.
  assert.ok(SEED_CONFIG_PATH.endsWith("/web/.env.stage2-seed.local"));
  execFileSync("git", ["check-ignore", "-q", ".env.stage2-seed.local"], { cwd: WEB });
  writeFileSync(join(dir, "x"), "");
  // The runner never logs a credential: no console call mentions a password, a PIN or the secrets map.
  const logs = source.split("\n").filter((l) => /console\.(log|error|warn|info)\(/.test(l));
  for (const l of logs) assert.equal(/password|secrets|pin\b|\$\{pin|S2_PW|S2_PIN/i.test(l.replace("credentials written to the local seed config", "")), false, `log line mentions a credential: ${l.trim()}`);
  assert.equal(/backup\.(updated|deleted)\.push\([^)]*(secret|password|pin\b)/i.test(source), false);
  assert.equal(/writeFileSync\(backupFile[^)]*(secret|password)/i.test(source), false);
});

test("cleanup covers every inserted id, every written table is drift-counted, and sales history blocks it", () => {
  const list = ops();
  const NO_DESCENT = new Set(["public.agency_domains"]);
  const roots = new Set(list.filter((o) => o.id && (o.kind === "insert" || o.kind === "clone") && !NO_DESCENT.has(o.table)).map((o) => o.id));
  const users = new Set(list.filter((o) => o.kind === "authUser").map((o) => o.id));
  const workspaces = new Set(list.filter((o) => o.table === "public.agencies").map((o) => o.id));
  for (const o of list) {
    if (!o.id || o.kind === "update" || o.kind === "pin") continue;
    assert.ok(roots.has(o.id) || users.has(o.id) || (NO_DESCENT.has(o.table) && workspaces.has(o.row.tenant_id)), `${o.table} ${o.key} is not reachable by --cleanup`);
  }
  for (const o of list.filter((x) => !x.id && !x.natural)) assert.ok(Object.values(o.row).some((v) => roots.has(v)), `${o.table} ${o.key} hangs off no fixture row`);
  for (const o of list.filter((x) => x.natural)) assert.ok(/ops\.filter\(\(x\) => x\.natural\)/.test(source) && source.includes("delete from ${o.table} where ${col} = $1"), `${o.key}: natural-key rows are deleted by cleanup`);
  const counted = source.slice(source.indexOf("const COUNT_TABLES"), source.indexOf("];", source.indexOf("const COUNT_TABLES")));
  for (const t of new Set(list.filter((o) => o.kind !== "authUser" && o.kind !== "update" && o.kind !== "pin").map((o) => o.table))) assert.ok(counted.includes(`"${t}"`), `${t} missing from COUNT_TABLES`);
  const body = source.slice(source.indexOf("async function cleanup("), source.indexOf("async function presentCount"));
  assert.ok(body.indexOf("assertNoSalesHistory(ops)") < body.indexOf("await purge("), "history guard runs before any delete");
  for (const frag of ["public.orders", "public.order_lines", "public.admissions", "public.tenant_promo_redemptions", "committed"]) assert.ok(source.includes(frag), frag);
  assert.match(source, /cleanup refused/);
});

test("the guards run before EVERY write batch, and the Stripe step refuses until it exists", () => {
  const runOps = source.slice(source.indexOf("async function runOps"), source.indexOf("// ---", source.indexOf("async function runOps")));
  assert.match(runOps, /await assertBatchGuards\("write batch", ops\)/);
  assert.ok(runOps.indexOf("assertBatchGuards") < runOps.indexOf("execInsert"));
  assert.match(source, /await assertBatchGuards\("cleanup batch", ops\)/);
  const guards = source.slice(source.indexOf("async function assertBatchGuards"), source.indexOf("async function context"));
  for (const frag of ["checkS2Target(env)", "STAGING_MARKER_AGENCY_ID", "verifyS2Plan(ops", "qa-[1-6]"]) assert.ok(guards.includes(frag), frag);
  assert.match(source, /--stripe/);
  assert.match(source, /the Stripe TEST step never runs with --selftest or --cleanup/);
  assert.ok(source.indexOf("checkS2Target(env)") < source.indexOf("pgMod.default.Client("), "the target check precedes any connection");
});

test("T1: three venue clocks, reservation rules, floor, QR, devices, shift and staff", () => {
  const list = ops();
  const venues = Object.fromEntries(["a", "b", "c"].map((t) => [t, byKey(list, `venue:t1-${t}`).row]));
  assert.equal(venues.a.timezone, "America/Cancun");
  assert.equal(venues.a.is_default, true);
  assert.equal("timezone" in venues.b, false, "venue B stays on the UTC column default");
  assert.equal(venues.c.timezone, "America/New_York");
  const ws = byKey(list, "workspace:t1");
  assert.equal(ws.row.default_currency, "MXN");
  assert.equal(ws.row.settings.display_currency, "MXN");
  assert.deepEqual(ws.row.supported_locales, ["es", "en"]);
  assert.equal(ws.row.workspace_type, "business");
  const rules = byKey(list, "rules:t1-a").row;
  assert.deepEqual([rules.deposit_from_party, rules.deposit_cents_per_person, rules.free_cancel_hours], [6, 10000, 24]);
  assert.ok(rules.no_show_fee_cents > 0);
  assert.equal(rules.reservation_offering_id, s2Id("offering:t1-reserva"));
  assert.equal(list.filter((o) => o.table === "public.spaces" && o.row.tenant_id === T1_WS).length, 5);
  assert.equal(list.filter((o) => o.table === "public.prep_stations" && o.row.tenant_id === T1_WS).map((o) => o.row.kind).sort().join(), "bar,kitchen");
  const visits = list.filter((o) => o.table === "public.visits" && o.row.tenant_id === T1_WS).map((o) => o.row.status).sort();
  assert.deepEqual(visits, ["closed", "open"]);
  assert.equal(list.filter((o) => o.table === "public.links" && o.row.tenant_id === T1_WS && o.row.kind === "menu").length, 1);
  const devices = list.filter((o) => o.table === "public.pos_devices");
  assert.deepEqual(devices.map((o) => JSON.parse(o.row.settings).mode).sort(), ["door", "door", "kitchen", "pos", "pos"]);
  assert.ok(devices.every((o) => o.row.device_key.length >= 8));
  assert.equal(byKey(list, "shift:t1-open").row.opening_cash_cents, 50000);
  // Staff
  const roles = Object.fromEntries(list.filter((o) => o.table === "public.agency_memberships" && o.row.tenant_id === T1_WS).map((o) => [o.row.profile_id, o.row]));
  const role = (k) => roles[s2Id(`user:${k}`)];
  assert.deepEqual(["t1-owner", "t1-admin", "t1-manager", "t1-editor", "t1-viewer"].map((k) => role(k).role), ["owner", "admin", "manager", "editor", "viewer"]);
  assert.ok(!["owner", "admin"].includes(role("t1-cashier").role), "the cashier cannot refund (refund needs admin or owner)");
  assert.equal(role("t1-pending").status, "invited");
  assert.equal(role("t1-pending").accepted_at, null);
  assert.equal(role("t1-suspended").status, "suspended");
  assert.equal(list.filter((o) => o.kind === "pin").length, 1);
  assert.equal(byKey(list, "pin:t1-manager").userId, s2Id("user:t1-manager"));
  assert.equal(list.filter((o) => o.table === "public.role_limits").length, 3);
  const limited = new Set(list.filter((o) => o.table === "public.role_limits").map((o) => `${o.row.role}:${o.row.action}`));
  assert.equal(limited.has("viewer:refund") || limited.has("admin:refund"), false, "some roles are deliberately unset");
});

test("T1 catalog: the prices and edge cases the card lists", () => {
  const list = ops(() => true, NOW, ["T1"]);
  const row = (k) => byKey(list, `offering:${k}`).row;
  assert.equal(row("t1-hamburguesa").amount_cents, 12000);
  assert.equal(byKey(list, "variant:t1-hamburguesa-grande").row.amount_cents, 15000);
  assert.deepEqual(list.filter((o) => o.table === "public.talent_offering_addons" && o.row.offering_id === s2Id("offering:t1-hamburguesa")).map((o) => o.row.amount_cents), [1000, 1500]);
  assert.equal(row("t1-burrito").amount_cents, 8000);
  assert.equal(row("t1-tacos-exp").amount_cents, 24900);
  assert.equal(row("t1-margarita").amount_cents, 9000);
  assert.equal(row("t1-cerveza-clara").amount_cents, 8000);
  assert.equal(row("t1-cerveza-oscura").amount_cents, 8000);
  const pool = (k) => list.find((o) => o.table === "public.capacity_pools" && o.row.subject_id === s2Id(`offering:${k}`)).row;
  assert.deepEqual([pool("t1-margarita").units_total, pool("t1-ultima").units_total, pool("t1-agotado").units_total], [5, 1, 0]);
  assert.equal(row("t1-margarita").capacity_pool_id, pool("t1-margarita").id);
  assert.equal(row("t1-agotado").inventory_qty, 0);
  const sushi = list.filter((o) => o.table === "public.talent_offerings" && o.row.category === "Sushi");
  assert.equal(sushi.length, 4);
  assert.equal(sushi.filter((o) => JSON.parse(o.row.attributes).premium).length, 1);
  assert.equal(list.filter((o) => o.table === "public.talent_offering_variants" && sushi.some((s) => s.id === o.row.offering_id)).length, 8);
  assert.equal(row("t1-opciones").amount_cents, null, "options-only dish has a null base");
  assert.equal(row("t1-banquete").visibility, "on_request");
  assert.equal(row("t1-borrador").status, "draft");
  assert.equal(list.filter((o) => o.table === "public.talent_offering_variants" && o.row.is_hidden).length, 1);
  assert.equal(row("t1-cena-show").kind, "package");
  assert.equal(list.filter((o) => o.table === "public.offering_components").length, 2);
  const ev = byKey(list, "event:t1-show").row;
  assert.equal(ev.status, "draft");
  assert.equal(ev.offering_id, s2Id("offering:t1-show-evento"));
  assert.match(ev.slug, /^s2-/);
  // The pools come before the offerings that point at them (capacity_pool_id FK).
  for (const k of ["t1-margarita", "t1-ultima", "t1-agotado"]) assert.ok(list.findIndex((o) => o.key === `pool:${k}`) < list.findIndex((o) => o.key === `offering:${k}`));
});

test("held-migration columns: built only when the live schema has them, otherwise reported with the exact version and file", () => {
  assert.equal(HELD.posEnabled.version, "20261231417300");
  assert.ok(existsSync(join(WEB, "..", HELD.posEnabled.file)), `${HELD.posEnabled.file} exists in the repo`);
  const without = plan(() => false);
  const pos = (r) => r.blocked.filter((b) => b.version === "20261231417300");
  assert.equal(pos(without).length, 1);
  assert.equal(without.ops.some((o) => o.key === "offering:t1-solo-linea"), false);
  const withCol = plan((c) => c === "talent_offerings.pos_enabled");
  assert.equal(pos(withCol).length, 0);
  assert.equal(byKey(withCol.ops, "offering:t1-solo-linea").row.pos_enabled, false);
});

test("T2 shares nothing with T1 (every cross-tenant check starts clean)", () => {
  const list = ops();
  const t2 = list.filter((o) => o.fx === "T2");
  const t1Ids = new Set(list.filter((o) => o.fx === "T1" && o.id).map((o) => o.id));
  const text = JSON.stringify(t2);
  for (const id of t1Ids) assert.equal(text.includes(id), false, `T2 names a T1 id ${id}`);
  const t2Tenants = new Set(t2.map((o) => o.row?.tenant_id).filter(Boolean));
  assert.ok(t2Tenants.size === 1 && !t2Tenants.has(T1_WS));
  assert.equal(t2.filter((o) => o.table === "public.talent_offerings").length, 3);
  assert.equal(byKey(t2, "promo:t2-fonda10").row.code, "FONDA10");
  assert.equal(t2.filter((o) => o.table === "public.visits").length, 1);
  assert.equal(t2.filter((o) => o.table === "public.links").length, 3);
  const s = summarise(list);
  assert.ok(s["public.talent_offerings"].insert >= 25 && s["public.agencies"].insert === 5);
});
