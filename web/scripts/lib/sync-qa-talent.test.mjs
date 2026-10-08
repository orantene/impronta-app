import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOwnedWrites,
  assertSelectOnly,
  buildDiff,
  collectOwnedMedia,
  matchOfferings,
  planWrites,
  sqlLiteral,
  writeToSql,
} from "./sync-qa-talent.mjs";

const SRC = "f048e578-cbae-45db-9a3b-34239abea136";
const TGT = "c99f8adb-8ebb-4aad-911a-897e73efd369";

const off = (o) => ({ id: `id-${o.title}`, kind: "service", currency: "MXN", status: "published", sort_order: 0, ...o });
const base = (over = {}) => ({
  profile: { id: SRC, display_name: "Jorg", languages: ["Español"], bio_i18n: { en: "a", es: "b" }, preferred_locale: "es", secondary_locales: ["en"] },
  taxonomy: [{ taxonomy_term_id: "t1", kind: "talent_type", slug: "lash-artist", is_primary: true, relationship_type: "primary_role", display_order: 0 }],
  offerings: [off({ title: "Acrygel", amount_cents: 55000, duration_minutes: 150, title_i18n: { en: "Acrygel", es: "Acrygel" } })],
  hours: { timezone: "America/Cancun", weekly: { 1: [{ startMin: 600, endMin: 1140 }] }, slot_minutes: 30, buffer_before_min: 15, buffer_after_min: 15, tenant_id: "40081ec3" },
  site: { theme_design_slug: "maison-v2", shell_tree: [{ id: "a", props: { v: 1 } }], shell_published: [{ id: "a" }], logo_url: "https://x.co/storage/v1/object/public/m/talent/f048e578-cbae-45db-9a3b-34239abea136/site/logo.png" },
  ...over,
});
const clone = (v) => structuredClone(v);

test("identical talents produce no diff", () => {
  const s = base();
  const t = clone(s);
  t.profile.id = TGT;
  const d = buildDiff({ source: s, target: t });
  assert.equal(d.entries.length, 0);
  assert.deepEqual(d.counts, {});
});

test("profile, locale, hours and site field drift is reported per area", () => {
  const s = base();
  const t = clone(s);
  t.profile.id = TGT;
  t.profile.languages = ["Spanish"];
  t.profile.bio_i18n.en = "different";
  t.profile.preferred_locale = "en";
  t.hours.buffer_after_min = 0;
  t.site.theme_design_slug = "folio";
  t.site.shell_published = [{ id: "a", extra: true }];
  const d = buildDiff({ source: s, target: t });
  const by = (area) => d.entries.filter((e) => e.area === area).map((e) => e.field);
  assert.deepEqual(by("profile").sort(), ["bio_i18n.en", "languages"]);
  assert.deepEqual(by("locale"), ["preferred_locale"]);
  assert.deepEqual(by("hours"), ["buffer_after_min"]);
  assert.deepEqual(by("site-design"), ["theme_design_slug"]);
  assert.deepEqual(by("site-sections"), ["shell_published"]);
  const lang = d.entries.find((e) => e.field === "languages");
  assert.deepEqual([lang.source, lang.target], [["Español"], ["Spanish"]]);
});

test("specialties are compared as a set and reported once", () => {
  const s = base();
  const t = clone(s);
  t.profile.id = TGT;
  s.taxonomy.push({ taxonomy_term_id: "t2", kind: "talent_type", slug: "brow-artist", is_primary: false, relationship_type: "secondary_role" });
  const d = buildDiff({ source: s, target: t });
  assert.equal(d.entries.filter((e) => e.col === "talent_profile_taxonomy").length, 1);
});

test("offerings pair by title, then by unique sort_order; extras and missing are reported", () => {
  const s = [off({ title: "Soft Gel", sort_order: 1 }), off({ title: "Acrygel", sort_order: 2 }), off({ title: "New", sort_order: 9 })];
  const t = [off({ title: "Soft Gel QA17", sort_order: 1 }), off({ title: "acrygel ", sort_order: 2 }), off({ title: "QA Walk", sort_order: 24 })];
  const m = matchOfferings(s, t);
  assert.equal(m.pairs.length, 2);
  assert.deepEqual(m.sourceOnly.map((r) => r.title), ["New"]);
  assert.deepEqual(m.targetOnly.map((r) => r.title), ["QA Walk"]);
});

test("offering price/title drift is diffed and extras are never writable", () => {
  const s = base();
  const t = clone(s);
  t.profile.id = TGT;
  t.offerings = [off({ title: "Acrygel", amount_cents: 1, duration_minutes: 150, title_i18n: { en: "Acrygel", es: "Acrygel" } }), off({ title: "QA only" })];
  const d = buildDiff({ source: s, target: t });
  assert.ok(d.entries.some((e) => e.field === "[Acrygel] amount_cents" && e.source === 55000 && e.target === 1));
  assert.equal(d.counts.offerings.total - d.counts.offerings.writable, 1);
});

test("owned media differences are listed, not counted as drift or copied", () => {
  const s = base();
  const t = clone(s);
  t.profile.id = TGT;
  t.site.logo_url = "https://x.co/other/talent/c99f8adb-8ebb-4aad-911a-897e73efd369/logo.png";
  s.site.shell_tree = [{ img: "https://x.co/storage/talent/f048e578-cbae-45db-9a3b-34239abea136/a.jpg" }];
  t.site.shell_tree = [{ img: "https://x.co/storage/talent/c99f8adb-8ebb-4aad-911a-897e73efd369/a.jpg" }];
  const d = buildDiff({ source: s, target: t });
  assert.ok(!d.entries.some((e) => e.col === "shell_tree"));
  assert.ok(d.entries.some((e) => e.col === "logo_url" && e.notCopied));
  assert.equal(collectOwnedMedia(s.site.shell_tree).length, 1);
  assert.throws(() => planWrites({ source: s, target: t, diff: { ...d, entries: [{ area: "site-sections", col: "shell_tree", kind: "json", field: "x", source: s.site.shell_tree, target: t.site.shell_tree }] }, targetProfileId: TGT, sourceProfileId: SRC }), /owned media/);
});

test("planWrites copies source values, scoped to the target, with ids rewritten", () => {
  const s = base();
  s.site.shell_tree = [{ ref: SRC }];
  const t = clone(s);
  t.profile.id = TGT;
  t.profile.languages = ["Spanish"];
  t.profile.bio_i18n = { en: "old", es: "b" };
  t.site.shell_tree = [{ ref: "old" }];
  t.offerings = [off({ title: "Acrygel", amount_cents: 1, duration_minutes: 150, title_i18n: { en: "Acrygel", es: "Acrygel" } })];
  s.taxonomy.push({ taxonomy_term_id: "t2", kind: "fit_label", slug: "x", is_primary: false, relationship_type: "attribute" });
  const d = buildDiff({ source: s, target: t });
  const w = planWrites({ source: s, target: t, diff: d, targetProfileId: TGT, sourceProfileId: SRC });
  const profile = w.find((x) => x.table === "talent_profiles");
  assert.deepEqual(profile.where, { id: TGT });
  assert.deepEqual(profile.set.languages.v, ["Español"]);
  assert.equal(profile.set.bio_i18n.v.en, "a");
  assert.equal(profile.set.bio_i18n.v.es, "b");
  assert.deepEqual(w.find((x) => x.table === "talent_sites").set.shell_tree.v, [{ ref: TGT }]);
  assert.ok(w.every((x) => !JSON.stringify(x).includes(SRC)));
  assert.ok(w.some((x) => x.table === "talent_offerings" && x.set.amount_cents.v === 55000));
  assert.equal(w.filter((x) => x.table === "talent_profile_taxonomy" && x.op === "insert").length, 2);
  assert.match(writeToSql(profile), /^UPDATE public\.talent_profiles SET .* WHERE id = 'c99f8adb/);
});

test("ownership guard refuses writes aimed at the source or unscoped rows", () => {
  const ok = { table: "talent_profiles", op: "update", where: { id: TGT }, set: { short_bio: { v: "x", kind: "text" } } };
  assert.equal(assertOwnedWrites([ok], { targetProfileId: TGT, sourceProfileId: SRC }), true);
  const bad = (w, re) => assert.throws(() => assertOwnedWrites([w], { targetProfileId: TGT, sourceProfileId: SRC }), re);
  bad({ ...ok, where: { id: SRC } }, /not scoped/);
  bad({ table: "talent_offerings", op: "update", where: { id: "o1" }, set: ok.set }, /not scoped/);
  bad({ table: "talent_offerings", op: "update", where: { talent_profile_id: SRC }, set: ok.set }, /not scoped/);
  bad({ table: "talent_offerings", op: "insert", values: { talent_profile_id: { v: SRC, kind: "uuid" } } }, /not owned/);
  bad({ table: "talent_profiles", op: "insert", values: { id: { v: TGT, kind: "uuid" } } }, /not owned/);
  bad({ table: "inquiries", op: "delete", where: { talent_profile_id: TGT } }, /table not allowed/);
  bad({ ...ok, set: { short_bio: { v: SRC, kind: "text" } } }, /SOURCE/);
  bad({ ...ok, set: {} }, /empty update/);
  assert.throws(() => assertOwnedWrites([ok], { targetProfileId: TGT, sourceProfileId: TGT }), /different/);
});

test("select-only guard and SQL literals", () => {
  assert.ok(assertSelectOnly("SELECT 1"));
  assert.throws(() => assertSelectOnly("UPDATE t SET a=1"), /read-only/);
  assert.throws(() => assertSelectOnly("SELECT 1; DELETE FROM t"), /read-only/);
  assert.equal(sqlLiteral("o'k", "text"), "'o''k'");
  assert.equal(sqlLiteral(["a", "b"], "textarray"), "ARRAY['a','b']::text[]");
  assert.equal(sqlLiteral([], "textarray"), "'{}'::text[]");
  assert.equal(sqlLiteral({ a: 1 }, "json"), `'{"a":1}'::jsonb`);
  assert.equal(sqlLiteral(null, "int"), "NULL");
});
