import assert from "node:assert/strict";
import { test } from "node:test";

import { stableId } from "./group6-fixtures.mjs";
import {
  DB_FIXTURES, HELD, MALFORMED_EMAIL, TEST_WORD_IN_COPY, checkFcTarget, checkPlan, fcId, isAllowedEmail, labelCollisions, parseFcArgs, serviceCopyProblems,
} from "./failed-cards-guards.mjs";
import { G6 } from "./failed-cards-ops.mjs";
import { FIXTURE_CARDS, buildPlan, fixtureIdSet, resolveFixtures, verifyPlan } from "./failed-cards-plan.mjs";
import { makeBlockingDraft, makeCopyOnlyDraft } from "./failed-cards-plan-sites.mjs";
import { checkBalanceLivemode, describeStripeSteps } from "./failed-cards-stripe.mjs";

const STAGING = "postgresql://postgres.fxlankepwnvelxjrahwk:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
const PROD = "postgresql://postgres.pluhdapdnuiulvxmyspd:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
const PAYLOAD = { shellTree: [], homeTree: [{ id: "c", kind: "container", props: {}, children: [{ id: "h", kind: "heading", props: { text: "{{displayName}}" } }] }] };
const ctx = (now = new Date("2026-10-19T12:00:00Z")) => ({
  now,
  trees: { shell: (n) => [{ id: "s", kind: "container", props: { n } }], home: (n) => [{ id: "x", kind: "container", props: { n } }] },
  templatePayload: PAYLOAD,
  housekeepingTermId: "243452c3-01ac-b167-ca0a-5101a29724b2",
});
const plan = (only = null) => buildPlan(resolveFixtures(only), ctx());

test("ids are deterministic and live in their own namespace (no Group-6 key collides)", () => {
  assert.equal(fcId("inquiry:f1"), fcId("inquiry:f1"));
  assert.notEqual(fcId("inquiry:guest"), stableId("inquiry:guest"));
  const a = plan();
  const b = buildPlan(resolveFixtures(null), ctx(new Date("2027-01-01T00:00:00Z")));
  assert.deepEqual(a.map((o) => o.id), b.map((o) => o.id), "same ids on every run (idempotent re-run)");
  const ids = a.filter((o) => o.id && o.kind !== "update" && o.table !== "public.talent_bookings").map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, "no id planned twice");
  const g6 = new Set(Object.values(G6));
  assert.ok(ids.every((id) => !g6.has(id)), "never inserts a Group-6 id");
});

test("the full plan passes its own guards", () => {
  const v = verifyPlan(plan(), []);
  assert.deepEqual(v.problems, []);
});

test("refuses production and any non-staging login", () => {
  assert.equal(checkFcTarget({ DATABASE_URL: STAGING }).ok, true);
  assert.equal(checkFcTarget({ DATABASE_URL: PROD }).ok, false);
  assert.equal(checkFcTarget({ DATABASE_URL: STAGING, NEXT_PUBLIC_SUPABASE_URL: "https://pluhdapdnuiulvxmyspd.supabase.co" }).ok, false);
  assert.equal(checkFcTarget({ DATABASE_URL: "postgresql://postgres:pw@db.fxlankepwnvelxjrahwk.supabase.co:5432/postgres" }).ok, false, "user must contain postgres.fxlank");
  assert.equal(checkFcTarget({}).ok, false);
  assert.equal(JSON.stringify(checkFcTarget({ DATABASE_URL: PROD })).includes(":pw@"), false, "never echoes the secret");
});

test("no pluhda, TAL-93938, TAL-93940 or TUL-52 anywhere in the plan", () => {
  const text = JSON.stringify(plan());
  for (const bad of ["pluhdapdnuiulvxmyspd", "TAL-93938", "TAL-93940", "TUL-52\""]) assert.equal(text.includes(bad), false, bad);
});

test("a write that names TAL-93938 / TAL-93940 (code or resolved id) is refused", () => {
  const ops = plan(["F9"]);
  const ids = fixtureIdSet(ops);
  const evil = { ...ops[0], row: { ...ops[0].row, description: "copy of TAL-93938" } };
  assert.equal(checkPlan([evil], { fixtureIds: ids }).ok, false);
  const qamaxId = "12b95e5c-ea28-45b9-909e-f478ca9dc5f2";
  const onQamax = { ...ops[0], row: { ...ops[0].row, talent_profile_id: qamaxId } };
  assert.equal(checkPlan([onQamax], { fixtureIds: ids, forbiddenIds: [qamaxId] }).ok, false, "TAL-93940 is observe-only");
});

test("updates may only touch this seed's own rows", () => {
  const upd = { fx: "F9", kind: "update", table: "public.talent_profiles", key: "x", id: G6.t1, set: { short_bio: "x" } };
  assert.equal(checkPlan([upd], { fixtureIds: new Set() }).ok, false);
  const updates = plan().filter((o) => o.kind === "update");
  const ids = fixtureIdSet(plan());
  assert.ok(updates.length > 0 && updates.every((u) => ids.has(u.id)));
});

test("mailboxes and slugs: only qa-fixture-g6 identifiers", () => {
  assert.equal(isAllowedEmail("qa-fixture-g6-free@impronta.test"), true);
  assert.equal(isAllowedEmail("tulalaqa+qa-fixture-g6-padded@mail.grokbot.com  "), true);
  assert.equal(isAllowedEmail(MALFORMED_EMAIL), true);
  assert.equal(isAllowedEmail("someone@gmail.com"), false);
  assert.equal(isAllowedEmail("tulalaqa+qamax@mail.grokbot.com"), false);
  const ops = plan(["F3"]);
  const bad = ops.map((o) => (o.table === "public.agencies" ? { ...o, row: { ...o.row, slug: "impronta" } } : o));
  assert.equal(verifyPlan(bad, []).ok, false);
});

test("no planned service title, summary or category says QA / test / E2E", () => {
  const services = plan().filter((o) => o.table === "public.talent_offerings");
  assert.ok(services.length >= 7);
  for (const s of services) {
    const i18n = JSON.parse(s.row.title_i18n);
    for (const v of [s.row.title, s.row.description, s.row.category, i18n.es, i18n.en]) assert.equal(TEST_WORD_IN_COPY.test(v ?? ""), false, `${s.key}: ${v}`);
  }
  const bad = [{ ...services[0], row: { ...services[0].row, title: "QA Limpieza" } }];
  assert.equal(serviceCopyProblems(bad).length, 1);
});

test("DNS labels are claimed once (workspace slugs, subdomains, site slugs)", () => {
  assert.deepEqual(labelCollisions(plan()), []);
  const clash = [
    { table: "public.agencies", id: "a", row: { slug: "qa-fixture-g6-x" } },
    { table: "public.talent_sites", id: "s", row: { site_slug: "qa-fixture-g6-x" } },
  ];
  assert.deepEqual(labelCollisions(clash), ["qa-fixture-g6-x"]);
});

test("F13 and S1 are held, never planned", () => {
  assert.ok(HELD.F13 && HELD.S1);
  assert.ok(parseFcArgs(["--only", "F13"]).errors.length > 0);
  assert.ok(parseFcArgs(["--stripe", "S1"]).errors.length > 0);
  assert.equal(DB_FIXTURES.includes("F13"), false);
  assert.equal(JSON.stringify(plan()).includes("is_publicly_hidden\":true"), false);
});

test("CLI: dry run by default, --apply needs --backup-file, selftest never calls Stripe", () => {
  const d = parseFcArgs([]);
  assert.equal(d.apply || d.cleanup || d.selftest, false);
  assert.ok(parseFcArgs(["--apply"]).errors.some((e) => e.includes("--backup-file")));
  assert.deepEqual(parseFcArgs(["--apply", "--backup-file", "/tmp/b.json"]).errors, []);
  assert.ok(parseFcArgs(["--selftest", "--stripe", "S2"]).errors.length > 0);
  assert.ok(parseFcArgs(["--selftest", "--apply"]).errors.length > 0);
  assert.ok(parseFcArgs(["--nope"]).errors.length > 0);
  assert.deepEqual(resolveFixtures(["F2"]), ["F3", "F2"], "F2 pulls in F3");
});

test("every fixture names the cards it unblocks", () => {
  for (const f of DB_FIXTURES) assert.ok(FIXTURE_CARDS[f]?.length, f);
});

test("F6 drafts: copy-only touches only the i18n overlay; blocking adds exactly one unknown placeholder", () => {
  const copy = makeCopyOnlyDraft(PAYLOAD);
  const node = copy.homeTree[0].children[0];
  assert.equal(node.props.text, "{{displayName}}", "base prop unchanged");
  assert.equal(node.props.i18n.es.text, "Bienvenida a mi espacio");
  const block = makeBlockingDraft(PAYLOAD);
  assert.equal((JSON.stringify(block).match(/\{\{qaNotAToken\}\}/g) ?? []).length, 1);
  assert.equal(PAYLOAD.homeTree[0].children[0].props.i18n, undefined, "template not mutated");
});

test("Stripe: TEST mode needs livemode=false from /v1/balance", () => {
  assert.equal(checkBalanceLivemode({ livemode: false }).ok, true);
  assert.equal(checkBalanceLivemode({ livemode: true }).ok, false);
  assert.equal(checkBalanceLivemode({}).ok, false);
  const lines = describeStripeSteps(["S6"], { mxKey: false });
  assert.ok(lines.some((l) => l.startsWith("SKIP S6 MX")));
});
