import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALT_MAX_CHARS, buildAllowList, buildBackup, changesOf, checkBackup, checkTarget, checkWritePlan, generateAlt, guessLocale,
  mergeAltI18n, narrowAllowList, parseArgs, planAll, planRestore, planRow, reusableAlt, sameJson, summarise,
} from "./demo-alt-i18n.mjs";

const STAGING = "postgresql://postgres.fxlankepwnvelxjrahwk:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
const PROD = "postgresql://postgres.pluhdapdnuiulvxmyspd:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
const { allowed } = buildAllowList(["TAL-93005", "TAL-93006", "TAL-93938", "TAL-93940", "TAL-91001", "nope"]);

const row = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  owner_talent_profile_id: "22222222-2222-4222-8222-222222222222",
  profile_code: "TAL-93005",
  display_name: "Diego Navarro",
  city: "Cancún",
  trade_en: "Open-format DJ",
  trade_es: "DJ de formato abierto",
  variant_kind: "gallery",
  sort_order: 0,
  alt: "f-hero",
  metadata: { source: "unsplash", photographer: "A", demo_batch: "b1", albumId: "main" },
  ...over,
});

test("allow-list keeps demo codes only and drops forbidden / foreign ones", () => {
  assert.deepEqual([...allowed].sort(), ["TAL-93005", "TAL-93006"]);
  const { dropped } = buildAllowList(["TAL-93938", "TAL-91001"]);
  assert.equal(dropped.length, 2);
});

test("generation: es and en, deterministic, no em dashes, within the cap", () => {
  const a = generateAlt({ name: "Diego Navarro", city: "Cancún", tradeEn: "Open-format DJ", tradeEs: "DJ de formato abierto" }, "gallery");
  assert.equal(a.en, "Work by Diego Navarro, open-format DJ, in Cancún");
  assert.equal(a.es, "Trabajo de Diego Navarro, DJ de formato abierto, en Cancún");
  const p = generateAlt({ name: "Diego Navarro", city: "Cancún", tradeEn: "DJ", tradeEs: "DJ" }, "card");
  assert.equal(p.en, "Portrait of Diego Navarro, DJ, in Cancún");
  assert.equal(p.es, "Retrato de Diego Navarro, DJ, en Cancún");
  assert.equal(generateAlt({ name: "Ana", city: "", tradeEn: "", tradeEs: "" }, "polaroid").es, "Polaroid de Ana");
  const f = { name: "Diego Navarro", city: "Cancún", tradeEn: "DJ", tradeEs: "DJ" };
  assert.deepEqual(generateAlt(f, "gallery"), generateAlt(f, "gallery"));
  const long = generateAlt({ name: "N".repeat(60), city: "C".repeat(40), tradeEn: "T".repeat(40), tradeEs: "T".repeat(40) }, "gallery");
  assert.ok(long.en.length <= ALT_MAX_CHARS && long.es.length <= ALT_MAX_CHARS);
  assert.doesNotMatch(generateAlt({ name: "A — B", city: "x–y", tradeEn: "t", tradeEs: "t" }, "card").en, /[–—]/);
});

test("reuse: a human English alt becomes EN, slug-style alt is never reused", () => {
  assert.equal(reusableAlt("f-hero"), null);
  assert.equal(reusableAlt("IMG_1234.jpg"), null);
  assert.equal(reusableAlt("DJ Diego Navarro mixing at a beach party"), "DJ Diego Navarro mixing at a beach party");
  assert.equal(guessLocale("Fotografía de la boda en la playa"), "es");
  const p = planRow(row({ alt: "DJ Diego Navarro mixing at a beach party" }), { allowed });
  assert.equal(p.status, "will-set");
  assert.equal(p.set.en, "DJ Diego Navarro mixing at a beach party");
  assert.equal(p.set.es, "Trabajo de Diego Navarro, DJ de formato abierto, en Cancún");
  const es = planRow(row({ alt: "Retrato de la novia en la playa" }), { allowed });
  assert.equal(es.set.es, "Retrato de la novia en la playa");
  assert.match(es.set.en, /^Work by Diego Navarro/);
});

test("plan: will-set writes only alt_i18n and keeps every other metadata key", () => {
  const p = planRow(row(), { allowed });
  assert.equal(p.status, "will-set");
  assert.deepEqual(Object.keys(p.after).sort(), ["albumId", "alt_i18n", "demo_batch", "photographer", "source"]);
  assert.equal(p.after.source, "unsplash");
  assert.deepEqual(Object.keys(p.after.alt_i18n).sort(), ["en", "es"]);
  assert.deepEqual(p.before, row().metadata);
  assert.ok(planRow(row({ metadata: null }), { allowed }).after.alt_i18n.en.length > 0);
});

test("additive merge: an existing locale is kept, the missing one is added", () => {
  const m = { k: 1, alt_i18n: { en: "Mine", fr: "Moi" } };
  const p = planRow(row({ metadata: m }), { allowed });
  assert.deepEqual(Object.keys(p.set), ["es"]);
  assert.equal(p.after.alt_i18n.en, "Mine");
  assert.equal(p.after.alt_i18n.fr, "Moi");
  assert.equal(p.after.k, 1);
  assert.deepEqual(mergeAltI18n({ a: 1 }, { es: "x" }), { a: 1, alt_i18n: { es: "x" } });
});

test("--force-locale overwrites only the named locale", () => {
  const m = { alt_i18n: { en: "Old en", es: "Old es" } };
  assert.equal(planRow(row({ metadata: m }), { allowed }).status, "already-set");
  const f = planRow(row({ metadata: m }), { allowed, forceLocales: ["es"] });
  assert.equal(f.status, "will-set");
  assert.deepEqual(Object.keys(f.set), ["es"]);
  assert.equal(f.after.alt_i18n.en, "Old en");
});

test("idempotence: applying the plan then planning again yields 0 changes (also with --force-locale)", () => {
  const rows = [row(), row({ id: "33333333-3333-4333-8333-333333333333", variant_kind: "card", metadata: { alt_i18n: { en: "x y z kept" } } })];
  const first = planAll(rows, { allowed });
  const changes = changesOf(first);
  assert.equal(changes.length, 2);
  const applied = rows.map((r) => ({ ...r, metadata: changes.find((c) => c.id === r.id).after }));
  const second = planAll(applied, { allowed });
  assert.equal(changesOf(second).length, 0);
  assert.deepEqual(summarise(second).totals, { photos: 2, "will-set": 0, "already-set": 2, skipped: 0 });
  const forced = { allowed, forceLocales: ["es"] };
  const f1 = changesOf(planAll(rows, forced));
  const appliedForced = rows.map((r) => ({ ...r, metadata: f1.find((c) => c.id === r.id).after }));
  assert.equal(changesOf(planAll(appliedForced, forced)).length, 0);
});

test("skips: non-demo owner, TAL-93938, bad alt_i18n, no name", () => {
  assert.match(planRow(row({ profile_code: "TAL-93938" }), { allowed }).reason, /forbidden/);
  assert.match(planRow(row({ profile_code: "TAL-91001" }), { allowed }).reason, /not an allow-listed/);
  assert.match(planRow(row({ metadata: { alt_i18n: "x" } }), { allowed }).reason, /not an object/);
  assert.match(planRow(row({ metadata: [] }), { allowed }).reason, /not a json object/);
  assert.match(planRow(row({ display_name: " " }), { allowed }).reason, /display name/);
  // even if a caller put TAL-93938 on the allow-list, it is still refused
  assert.equal(planRow(row({ profile_code: "TAL-93938" }), { allowed: new Set(["TAL-93938"]) }).status, "skipped");
});

test("guards: target must be the staging ref; pluhda and anything else is refused", () => {
  assert.equal(checkTarget({ DATABASE_URL: STAGING }).ok, true);
  assert.equal(checkTarget({ DATABASE_URL: PROD }).ok, false);
  assert.equal(checkTarget({ DATABASE_URL: STAGING, SUPABASE_URL_X: "https://pluhdapdnuiulvxmyspd.supabase.co" }).ok, false);
  assert.equal(checkTarget({ DATABASE_URL: "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0.pooler.supabase.com:6543/postgres" }).ok, false);
  assert.equal(checkTarget({}).ok, false);
});

test("guards: write plan refuses wrong table/column, non-demo owner, forbidden owner, off-surface after", () => {
  const good = changesOf(planAll([row()], { allowed }));
  assert.equal(checkWritePlan(good, { allowed }).ok, true);
  assert.equal(checkWritePlan(good.map((c) => ({ ...c, table: "talent_profiles" })), { allowed }).ok, false);
  assert.equal(checkWritePlan(good.map((c) => ({ ...c, column: "alt" })), { allowed }).ok, false);
  assert.equal(checkWritePlan(good.map((c) => ({ ...c, profile_code: "TAL-91001" })), { allowed }).ok, false);
  assert.match(checkWritePlan(good.map((c) => ({ ...c, profile_code: "TAL-93938" })), { allowed: new Set(["TAL-93938"]) }).problems.join(), /forbidden/);
  assert.equal(checkWritePlan(good.map((c) => ({ ...c, after: { ...c.after, source: "changed" } })), { allowed }).ok, false);
  assert.equal(checkWritePlan(good, { allowed, forbiddenIds: [good[0].owner_talent_profile_id] }).ok, false);
  assert.equal(checkWritePlan(good.map((c) => ({ ...c, set: { fr: "x" } })), { allowed }).ok, false);
});

test("args: apply needs a backup file, selftest is exclusive, --only must be demo and never forbidden", () => {
  assert.ok(parseArgs(["--apply"]).errors.length);
  assert.equal(parseArgs(["--apply", "--backup-file", "/tmp/x.json"]).errors.length, 0);
  assert.ok(parseArgs(["--backup-file", "/tmp/x.json"]).errors.length);
  assert.ok(parseArgs(["--selftest", "--apply", "--backup-file", "x"]).errors.length);
  assert.ok(parseArgs(["--only", "TAL-93938"]).errors.length);
  assert.ok(parseArgs(["--only", "TAL-91001"]).errors.length);
  assert.ok(parseArgs(["--force-locale", "fr"]).errors.length);
  assert.deepEqual(parseArgs(["--only", "tal-93005,TAL-93006"]).only, ["TAL-93005", "TAL-93006"]);
  assert.ok(parseArgs(["--bogus"]).errors.length);
  assert.equal(parseArgs([]).apply, false);
  assert.deepEqual(narrowAllowList(allowed, ["TAL-93005"]).allowed, new Set(["TAL-93005"]));
  assert.ok(narrowAllowList(allowed, ["TAL-93938"]).errors.length);
  assert.ok(narrowAllowList(allowed, ["TAL-93099"]).errors.length);
});

test("backup shape and restore: pre-image recorded, restore only where metadata still equals after", () => {
  const changes = changesOf(planAll([row()], { allowed }));
  const b = buildBackup({ mode: "apply", at: "2026-10-21T00:00:00.000Z", changes });
  assert.equal(b.kind, "demo-alt-i18n-repair");
  assert.equal(b.target, "fxlankepwnvelxjrahwk");
  assert.deepEqual(Object.keys(b.updated[0]).sort(), ["after", "before", "column", "id", "owner_talent_profile_id", "profile_code", "table"]);
  assert.deepEqual(b.updated[0].before, row().metadata);
  assert.equal(checkBackup(b, { allowed }).ok, true);
  assert.equal(checkBackup({ ...b, target: "pluhdapdnuiulvxmyspd" }, { allowed }).ok, false);
  assert.equal(checkBackup({ ...b, updated: [{ ...b.updated[0], table: "talent_profiles" }] }, { allowed }).ok, false);
  assert.equal(checkBackup({ ...b, updated: [{ ...b.updated[0], profile_code: "TAL-93938" }] }, { allowed }).ok, false);

  const id = b.updated[0].id;
  const live = (metadata) => new Map([[id, { metadata }]]);
  assert.equal(planRestore(b, live(b.updated[0].after))[0].status, "will-restore");
  assert.equal(planRestore(b, live(b.updated[0].before))[0].status, "already-restored");
  assert.equal(planRestore(b, live({ other: 1 }))[0].status, "skipped");
  assert.equal(planRestore(b, new Map())[0].status, "skipped");
  assert.ok(sameJson({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }));
});

test("trade comes from taxonomy_terms.name_i18n: each locale falls back to the other, then no trade phrase", () => {
  const onlyEn = planRow(row({ trade_en: "Photographer", trade_es: null }), { allowed });
  assert.equal(onlyEn.set.en, "Work by Diego Navarro, photographer, in Cancún");
  assert.equal(onlyEn.set.es, "Trabajo de Diego Navarro, photographer, en Cancún");
  const onlyEs = planRow(row({ trade_en: null, trade_es: "Fotógrafo" }), { allowed });
  assert.equal(onlyEs.set.en, "Work by Diego Navarro, fotógrafo, in Cancún");
  assert.equal(onlyEs.set.es, "Trabajo de Diego Navarro, fotógrafo, en Cancún");
  const none = planRow(row({ trade_en: null, trade_es: "  " }), { allowed });
  assert.equal(none.status, "will-set");
  assert.equal(none.set.en, "Work by Diego Navarro, in Cancún");
  assert.equal(none.set.es, "Trabajo de Diego Navarro, en Cancún");
});
