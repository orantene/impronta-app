import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RENATA_NEW_ES,
  RENATA_OFFERING_ID,
  RENATA_OLD_ES,
  runContentFixes,
  sameJson,
  type ContentFixIo,
  type FaqFullRow,
  type FaqInsert,
} from "./content-fixes";
import type { OfferingRow, ProfileRow } from "./plan";

interface Db {
  profiles: Record<string, ProfileRow>;
  slugs: Record<string, string | null>;
  offerings: Record<string, OfferingRow[]>;
  faq: Record<string, FaqFullRow[]>;
}

interface Calls {
  updates: Array<{ profileId: string; id: string; description: string | null; description_i18n: Record<string, string> }>;
  inserts: Array<{ profileId: string; rows: FaqInsert[] }>;
  backups: Array<{ label: string; data: unknown }>;
}

function fakeIo(db: Db, opts: { corruptInsert?: boolean; jsonbKeyOrder?: boolean } = {}): { io: ContentFixIo; calls: Calls } {
  const calls: Calls = { updates: [], inserts: [], backups: [] };
  let n = 0;
  // jsonb returns object keys in its own order (shorter keys first, then alphabetical): `{en, es}`.
  const reorder = (v: unknown): unknown => {
    if (!opts.jsonbKeyOrder) return v;
    if (Array.isArray(v)) return v.map(reorder);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort((a, b) => a.length - b.length || a.localeCompare(b)).map((k) => [k, reorder(o[k])]));
    }
    return v;
  };
  const io: ContentFixIo = {
    async findProfile(code) { return db.profiles[code] ?? null; },
    async findSiteSlug(id) { return db.slugs[id] ?? null; },
    async listOfferings(id) { return reorder(JSON.parse(JSON.stringify(db.offerings[id] ?? []))) as OfferingRow[]; },
    async listFaqFull(id) { return reorder(JSON.parse(JSON.stringify(db.faq[id] ?? []))) as FaqFullRow[]; },
    async updateOfferingDescription(input) {
      calls.updates.push(input);
      const row = db.offerings[input.profileId]?.find((o) => o.id === input.id);
      if (!row) return { ok: false, error: "no row" };
      row.description = input.description;
      row.description_i18n = input.description_i18n;
      return { ok: true };
    },
    async insertFaqRows(input) {
      calls.inserts.push(input);
      const ids: string[] = [];
      for (const r of input.rows) {
        const id = `new-${++n}`;
        ids.push(id);
        const stored: FaqFullRow = { id, ...r };
        if (opts.corruptInsert) stored.status = "draft";
        (db.faq[input.profileId] ??= []).push(stored);
      }
      return { ok: true, ids };
    },
    writeBackup(label, data) { calls.backups.push({ label, data: JSON.parse(JSON.stringify(data)) }); return `/tmp/${label}.json`; },
  };
  return { io, calls };
}

function baseDb(): Db {
  return {
    profiles: {
      "TAL-93002": { id: "pR", profile_code: "TAL-93002", is_demo: true },
      "TAL-93007": { id: "pS", profile_code: "TAL-93007", is_demo: true },
    },
    slugs: { pR: "renata-lashes", pS: "sofia-barra" },
    offerings: {
      pR: [{
        id: RENATA_OFFERING_ID,
        title: "Lifting y tinte",
        description: RENATA_OLD_ES,
        category: null,
        title_i18n: { es: "Lifting y tinte", en: "Lash lift and tint" },
        description_i18n: { es: RENATA_OLD_ES, en: "Curl and color for your natural lashes, no extensions." },
        category_i18n: {},
      }],
    },
    faq: { pR: [], pS: [] },
  };
}

const out = () => { const lines: string[] = []; return { lines, log: (l: string) => { lines.push(l); } }; };
const ARGS = ["--content-fixes"];
const APPLY = ["--content-fixes", "--apply", "--yes"];

test("dry run writes and backs up nothing, and prints the full rows it would insert", async () => {
  const { io, calls } = fakeIo(baseDb());
  const o = out();
  const res = await runContentFixes(ARGS, io, o.log);
  assert.equal(res.exitCode, 0);
  assert.equal(calls.updates.length + calls.inserts.length + calls.backups.length, 0);
  const text = o.lines.join("\n");
  assert.match(text, /old ES: "Curvatura natural que dura de 6 a 8 semanas\."/);
  assert.match(text, /new ES: "Curvatura y color para tus pestañas naturales, sin extensiones\."/);
  assert.match(text, /would INSERT 4 rows \(profile pS\)/);
  assert.match(text, /"question_i18n":\{"es":"¿Cómo reservo\?","en":"How do I book\?"\}/);
  assert.match(text, /needs fact:/);
});

test("apply updates only ES of Renata's offering, leaves EN, backs up first, verifies", async () => {
  const db = baseDb();
  const { io, calls } = fakeIo(db);
  const res = await runContentFixes(APPLY, io, () => {});
  assert.equal(res.exitCode, 0);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0]!.profileId, "pR");
  assert.equal(calls.updates[0]!.id, RENATA_OFFERING_ID);
  assert.deepEqual(calls.updates[0]!.description_i18n, { es: RENATA_NEW_ES, en: "Curl and color for your natural lashes, no extensions." });
  assert.equal(calls.updates[0]!.description, RENATA_NEW_ES);
  assert.equal(calls.backups[0]!.label, "tul-207-content-fixes-before");
  const before = calls.backups[0]!.data as { renata: { talent_offerings: OfferingRow } };
  assert.equal(before.renata.talent_offerings.description, RENATA_OLD_ES);
});

test("Renata fix is skipped when the stored ES differs from the known old text", async () => {
  const db = baseDb();
  db.offerings.pR![0]!.description_i18n = { es: "Otro texto que alguien escribió.", en: "x" };
  db.offerings.pR![0]!.description = "Otro texto que alguien escribió.";
  const { io, calls } = fakeIo(db);
  const o = out();
  const res = await runContentFixes(APPLY, io, o.log);
  assert.equal(res.exitCode, 0);
  assert.equal(calls.updates.length, 0);
  assert.match(o.lines.join("\n"), /unexpected current value, skipped/);
  // The FAQ insert is independent and still goes ahead.
  assert.equal(calls.inserts.length, 1);
});

test("Renata fix is skipped when the offering id is not on the profile", async () => {
  const db = baseDb();
  db.offerings.pR![0]!.id = "someone-elses-offering";
  const { io, calls } = fakeIo(db);
  await runContentFixes(APPLY, io, () => {});
  assert.equal(calls.updates.length, 0);
});

test("FAQ insert: 4 published rows with es+en, sort 0..3, all keyed by her profile id", async () => {
  const db = baseDb();
  const { io, calls } = fakeIo(db);
  const res = await runContentFixes(APPLY, io, () => {});
  assert.equal(res.exitCode, 0);
  assert.equal(calls.inserts.length, 1);
  const rows = calls.inserts[0]!.rows;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.sort_order), [0, 1, 2, 3]);
  for (const r of rows) {
    assert.equal(r.talent_profile_id, "pS");
    assert.equal(r.status, "published");
    assert.equal(r.question, r.question_i18n.es);
    assert.equal(r.answer, r.answer_i18n.es);
    assert.ok(r.question_i18n.en.length > 0 && r.answer_i18n.en.length > 0);
    assert.ok(![r.question, r.answer, r.question_i18n.en, r.answer_i18n.en].some((t) => /[—–]/.test(t)), "no dashes");
  }
  assert.deepEqual(rows.map((r) => r.question_i18n.en), ["How do I book?", "What are your hours?", "Where do you work?", "What do you offer and what does it cost?"]);
  assert.ok(Object.values(db.faq).flat().every((r) => r.talent_profile_id === "pS"));
  assert.deepEqual(res.wrote.faqIds, ["new-1", "new-2", "new-3", "new-4"]);
});

test("the inserted ids go to a backup file so a rollback can delete exactly them", async () => {
  const { io, calls } = fakeIo(baseDb());
  const res = await runContentFixes(APPLY, io, () => {});
  const ids = calls.backups.find((b) => b.label === "tul-207-content-fixes-inserted-ids");
  assert.ok(ids);
  assert.deepEqual((ids!.data as { insertedFaqIds: string[] }).insertedFaqIds, res.wrote.faqIds);
  assert.equal(res.backupPaths.length, 2);
});

test("FAQ insert is refused when she already has any row", async () => {
  const db = baseDb();
  db.faq.pS = [{ id: "old1", talent_profile_id: "pS", question: "q", answer: "a", status: "draft", sort_order: 0, question_i18n: {}, answer_i18n: {} }];
  const { io, calls } = fakeIo(db);
  const o = out();
  const res = await runContentFixes(APPLY, io, o.log);
  assert.equal(res.exitCode, 0);
  assert.equal(calls.inserts.length, 0);
  assert.match(o.lines.join("\n"), /refusing to insert: 1 FAQ row\(s\) already exist/);
  assert.equal(db.faq.pS!.length, 1);
});

test("a failed verification exits 1 and points at the backups", async () => {
  const { io } = fakeIo(baseDb(), { corruptInsert: true });
  const o = out();
  const res = await runContentFixes(APPLY, io, o.log);
  assert.equal(res.exitCode, 1);
  assert.match(o.lines.join("\n"), /VERIFY FAILED/);
});

test("refuses when a profile is not flagged demo, with no write at all", async () => {
  for (const code of ["TAL-93002", "TAL-93007"]) {
    const db = baseDb();
    db.profiles[code]!.is_demo = false;
    const { io, calls } = fakeIo(db);
    const res = await runContentFixes(APPLY, io, () => {});
    assert.equal(res.exitCode, 3, code);
    assert.equal(calls.updates.length + calls.inserts.length + calls.backups.length, 0);
  }
});

test("refuses a wrong site slug, including Jorgelina's real sites", async () => {
  for (const slug of ["someone-else", "book-jorgelina", "jor-beauty-qa"]) {
    const db = baseDb();
    db.slugs.pS = slug;
    const { io, calls } = fakeIo(db);
    const res = await runContentFixes(APPLY, io, () => {});
    assert.equal(res.exitCode, 3, slug);
    assert.equal(calls.updates.length + calls.inserts.length, 0);
  }
});

test("refuses forbidden profile codes even if they were put on the allow-list", async () => {
  for (const [code, slug] of [["TAL-93938", "book-jorgelina"], ["TAL-93900", "jorg-beauty-qa"]] as const) {
    const db = baseDb();
    db.profiles[code] = { id: "pJ", profile_code: code, is_demo: true };
    db.slugs.pJ = slug;
    const { io, calls } = fakeIo(db);
    const o = out();
    const res = await runContentFixes(APPLY, io, o.log, {
      targets: [
        { profileCode: code, siteSlug: slug, hosts: [] },
        { profileCode: "TAL-93002", siteSlug: "renata-lashes", hosts: [] },
        { profileCode: "TAL-93007", siteSlug: "sofia-barra", hosts: [] },
      ],
    });
    // The forbidden entry is not a content-fix target (only 93002 and 93007 are read), so
    // it is never touched; and a forbidden code standing in for a fix target is refused.
    assert.equal(res.exitCode, 0);
    assert.ok(calls.updates.every((u) => u.profileId !== "pJ"));
    assert.ok(calls.inserts.every((i) => i.profileId !== "pJ"));
    assert.ok(!o.lines.join("\n").includes(code));
  }
  // A database that returns a forbidden profile for a fix target is refused.
  const db = baseDb();
  db.profiles["TAL-93007"] = { id: "pJ", profile_code: "TAL-93938", is_demo: true };
  const { io, calls } = fakeIo(db);
  const res = await runContentFixes(APPLY, io, () => {});
  assert.equal(res.exitCode, 3);
  assert.equal(calls.updates.length + calls.inserts.length + calls.backups.length, 0);
});

test("refuses when a fix target is missing from the allow-list", async () => {
  const { io, calls } = fakeIo(baseDb());
  const res = await runContentFixes(APPLY, io, () => {}, { targets: [{ profileCode: "TAL-93002", siteSlug: "renata-lashes", hosts: [] }] });
  assert.equal(res.exitCode, 3);
  assert.equal(calls.updates.length + calls.inserts.length, 0);
});

test("argument guards: --apply needs --yes, --yes needs --apply, unknown flags and --only are refused", async () => {
  for (const argv of [["--content-fixes", "--apply"], ["--content-fixes", "--yes"], ["--content-fixes", "--only", "TAL-93002"], ["--content-fixes", "--force"]]) {
    const { io, calls } = fakeIo(baseDb());
    const res = await runContentFixes(argv, io, () => {});
    assert.equal(res.exitCode, 3, argv.join(" "));
    assert.equal(calls.updates.length + calls.inserts.length + calls.backups.length, 0);
  }
});

test("verify is key-order insensitive: jsonb returning {en, es} for a planned {es, en} is not a failure", async () => {
  const db = baseDb();
  const { io } = fakeIo(db, { jsonbKeyOrder: true });
  const lines: string[] = [];
  const res = await runContentFixes(APPLY, io, (l) => lines.push(l));
  assert.equal(res.exitCode, 0, lines.join("\n"));
  assert.ok(!lines.some((l) => l.includes("VERIFY FAILED")));
  assert.match(lines.join("\n"), /Applied and verified/);
});

test("sameJson: key order is ignored, values and nesting are not", () => {
  assert.equal(sameJson({ es: "a", en: "b" }, { en: "b", es: "a" }), true);
  assert.equal(sameJson({ es: "a", en: "b" }, { en: "b", es: "A" }), false);
  assert.equal(sameJson({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } }), true);
  assert.equal(sameJson([1, 2], [2, 1]), false);
  assert.equal(sameJson(null, {}), false);
});
