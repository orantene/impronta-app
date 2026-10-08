import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { transformSync } from "esbuild";

import { CONTENT, type ProfileContent } from "./content";
import { run, type FaqRow, type Io, type OfferingRow, type ProfileRow, type Table } from "./plan";
import { ALLOWED_TARGETS, FORBIDDEN_PROFILE_CODES, FORBIDDEN_SITE_SLUGS, type DemoTarget } from "./targets";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- a fake database

interface FakeDb {
  profiles: Record<string, ProfileRow>;
  slugs: Record<string, string | null>;
  offerings: Record<string, OfferingRow[]>;
  faq: Record<string, FaqRow[]>;
}

interface Calls { writes: Array<{ table: Table; profileId: string; id: string; patch: Record<string, unknown> }>; backups: unknown[] }

function fakeIo(db: FakeDb, opts: { corruptWrites?: boolean } = {}): { io: Io; calls: Calls } {
  const calls: Calls = { writes: [], backups: [] };
  const io: Io = {
    async findProfile(code) { return db.profiles[code] ?? null; },
    async findSiteSlug(id) { return db.slugs[id] ?? null; },
    async listOfferings(id) { return JSON.parse(JSON.stringify(db.offerings[id] ?? [])) as OfferingRow[]; },
    async listFaq(id) { return JSON.parse(JSON.stringify(db.faq[id] ?? [])) as FaqRow[]; },
    async updateRow({ table, profileId, id, patch }) {
      calls.writes.push({ table, profileId, id, patch });
      const rows = (table === "talent_offerings" ? db.offerings[profileId] : db.faq[profileId]) as Array<Record<string, unknown>> | undefined;
      const row = rows?.find((r) => r.id === id);
      if (!row) return { ok: false, error: "no row" };
      for (const [col, val] of Object.entries(patch)) row[col] = opts.corruptWrites ? { es: "changed" } : val;
      return { ok: true };
    },
    writeBackup(data) { calls.backups.push(JSON.parse(JSON.stringify(data))); return "/tmp/backup.json"; },
  };
  return { io, calls };
}

const TARGET: DemoTarget = { profileCode: "TAL-93002", siteSlug: "renata-lashes", hosts: ["renata-lashes-demo"] };
const CONTENT_ONE: Record<string, ProfileContent> = {
  "TAL-93002": {
    siteSlug: "renata-lashes",
    label: "Renata",
    services: [{ title: { es: "Pestañas clásicas", en: "Classic lashes" }, description: { es: "Set completo.", en: "Full set." } }],
    categories: [{ es: "Pestañas", en: "Lashes" }],
    faq: [{ question: { es: "¿Cuánto duran?", en: "How long do they last?" }, answer: { es: "Tres semanas.", en: "Three weeks." } }],
    needsContent: ["reviews"],
  },
};

function baseDb(): FakeDb {
  return {
    profiles: { "TAL-93002": { id: "p1", profile_code: "TAL-93002", is_demo: true } },
    slugs: { p1: "renata-lashes" },
    offerings: {
      p1: [
        { id: "o1", title: "Pestañas clásicas", description: "Set completo.", category: "Pestañas", title_i18n: { es: "Pestañas clásicas" }, description_i18n: { es: "Set completo." }, category_i18n: { es: "Pestañas" } },
        { id: "o2", title: "Algo no listado", description: "x", category: null, title_i18n: {}, description_i18n: {}, category_i18n: {} },
      ],
    },
    faq: { p1: [{ id: "f1", question: "¿Cuánto duran?", answer: "Tres semanas.", question_i18n: { es: "¿Cuánto duran?" }, answer_i18n: { es: "Tres semanas." } }] },
  };
}

const opts = () => ({ targets: [TARGET], content: CONTENT_ONE });
const lines = () => { const out: string[] = []; return { out, log: (l: string) => { out.push(l); } }; };

// ---------------------------------------------------------------- dry run

test("dry run writes nothing, backs up nothing, and lists what it would add", async () => {
  const db = baseDb();
  const { io, calls } = fakeIo(db);
  const l = lines();
  const res = await run([], io, l.log, opts());
  assert.equal(res.exitCode, 0);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.backups.length, 0);
  assert.deepEqual(res.touchedProfiles, ["TAL-93002"]);
  const text = l.out.join("\n");
  assert.match(text, /TAL-93002 slug=renata-lashes is_demo=true/);
  assert.match(text, /talent_offerings o1: title_i18n: ES "Pestañas clásicas" -> add EN "Classic lashes"/);
  assert.match(text, /talent_offerings o1: category_i18n: ES "Pestañas" -> add EN "Lashes"/);
  assert.match(text, /talent_faq_items f1: question_i18n: ES "¿Cuánto duran\?" -> add EN "How long do they last\?"/);
  assert.match(text, /Profiles that would be touched \(1\): TAL-93002/);
  assert.match(text, /needs content: reviews/);
  assert.equal(db.offerings.p1![0]!.title_i18n && (db.offerings.p1![0]!.title_i18n as Record<string, string>).en, undefined);
});

// ---------------------------------------------------------------- refusals

test("refuses a profile that is not flagged demo, with no write", async () => {
  const db = baseDb();
  db.profiles["TAL-93002"]!.is_demo = false;
  const { io, calls } = fakeIo(db);
  const l = lines();
  const res = await run(["--apply", "--yes"], io, l.log, opts());
  assert.equal(res.exitCode, 3);
  assert.equal(calls.writes.length + calls.backups.length, 0);
  assert.match(l.out.join("\n"), /not flagged is_demo/);
});

test("refuses when is_demo is null", async () => {
  const db = baseDb();
  db.profiles["TAL-93002"]!.is_demo = null;
  const { io } = fakeIo(db);
  assert.equal((await run([], io, () => {}, opts())).exitCode, 3);
});

test("refuses a site slug that is not the allow-listed one", async () => {
  const db = baseDb();
  db.slugs.p1 = "someone-else";
  const { io, calls } = fakeIo(db);
  const res = await run(["--apply", "--yes"], io, () => {}, opts());
  assert.equal(res.exitCode, 3);
  assert.equal(calls.writes.length, 0);
});

test("refuses Jorgelina by profile code, book-jorgelina and jor-beauty slug", async () => {
  for (const [code, slug] of [["TAL-93938", "book-jorgelina"], ["TAL-93900", "jorg-beauty-qa"]] as const) {
    const bad: DemoTarget = { profileCode: code, siteSlug: slug, hosts: [] };
    const { io, calls } = fakeIo({ profiles: {}, slugs: {}, offerings: {}, faq: {} });
    const l = lines();
    const res = await run([], io, l.log, { targets: [bad], content: {} });
    assert.equal(res.exitCode, 3, code);
    assert.equal(calls.writes.length, 0);
    assert.match(l.out.join("\n"), /REFUSED/);
  }
  // Even a forbidden site slug on an allow-listed code is refused at run time.
  const db = baseDb();
  db.slugs.p1 = "book-jorgelina";
  assert.equal((await run([], fakeIo(db).io, () => {}, opts())).exitCode, 3);
});

test("the shipped allow-list and content can never include a forbidden target", () => {
  for (const t of ALLOWED_TARGETS) {
    assert.ok(!FORBIDDEN_PROFILE_CODES.includes(t.profileCode), t.profileCode);
    assert.ok(!FORBIDDEN_SITE_SLUGS.includes(t.siteSlug), t.siteSlug);
    assert.ok(CONTENT[t.profileCode], `content entry for ${t.profileCode}`);
    assert.equal(CONTENT[t.profileCode]!.siteSlug, t.siteSlug);
  }
  for (const code of Object.keys(CONTENT)) assert.ok(ALLOWED_TARGETS.some((t) => t.profileCode === code), `${code} is on the allow-list`);
  assert.ok(!JSON.stringify(ALLOWED_TARGETS).includes("jorgelina"));
});

test("refuses content for a profile that is not on the allow-list", async () => {
  const { io } = fakeIo(baseDb());
  const res = await run([], io, () => {}, { targets: [TARGET], content: { ...CONTENT_ONE, "TAL-90000": CONTENT_ONE["TAL-93002"]! } });
  assert.equal(res.exitCode, 3);
});

test("refuses --only for a code off the allow-list, unknown flags, and --yes without --apply", async () => {
  const { io } = fakeIo(baseDb());
  assert.equal((await run(["--only", "TAL-93938"], io, () => {}, opts())).exitCode, 3);
  assert.equal((await run(["--wat"], io, () => {}, opts())).exitCode, 3);
  assert.equal((await run(["--yes"], io, () => {}, opts())).exitCode, 3);
  assert.equal((await run(["--apply"], io, () => {}, opts())).exitCode, 3);
});

test("one refusal among several profiles aborts everything before any write", async () => {
  const other: DemoTarget = { profileCode: "TAL-93003", siteSlug: "camila-nails", hosts: [] };
  const db = baseDb();
  db.profiles["TAL-93003"] = { id: "p2", profile_code: "TAL-93003", is_demo: false };
  db.slugs.p2 = "camila-nails";
  const { io, calls } = fakeIo(db);
  const res = await run(["--apply", "--yes"], io, () => {}, { targets: [TARGET, other], content: { ...CONTENT_ONE, "TAL-93003": { ...CONTENT_ONE["TAL-93002"]!, siteSlug: "camila-nails" } } });
  assert.equal(res.exitCode, 3);
  assert.equal(calls.writes.length + calls.backups.length, 0);
});

test("a profile missing from the database is reported and skipped, not written", async () => {
  const db = baseDb();
  delete db.profiles["TAL-93002"];
  const { io, calls } = fakeIo(db);
  const l = lines();
  const res = await run(["--apply", "--yes"], io, l.log, opts());
  assert.equal(res.exitCode, 0);
  assert.equal(calls.writes.length, 0);
  assert.match(l.out.join("\n"), /TAL-93002: not found/);
});

// ---------------------------------------------------------------- the write rules

test("apply writes one patch per row with only the planned i18n columns", async () => {
  const db = baseDb();
  const { io, calls } = fakeIo(db);
  const res = await run(["--apply", "--yes"], io, () => {}, opts());
  assert.equal(res.exitCode, 0);
  assert.equal(calls.backups.length, 1);
  assert.equal(res.backupPath, "/tmp/backup.json");
  assert.equal(calls.writes.length, 2);
  const allowed = new Set(["title_i18n", "description_i18n", "category_i18n", "question_i18n", "answer_i18n"]);
  for (const w of calls.writes) {
    assert.equal(w.profileId, "p1");
    for (const col of Object.keys(w.patch)) assert.ok(allowed.has(col), col);
  }
  const o1 = db.offerings.p1![0]!;
  assert.deepEqual(o1.title_i18n, { es: "Pestañas clásicas", en: "Classic lashes" });
  assert.deepEqual(o1.description_i18n, { es: "Set completo.", en: "Full set." });
  assert.deepEqual(o1.category_i18n, { es: "Pestañas", en: "Lashes" });
  assert.equal(o1.title, "Pestañas clásicas");
  const f1 = db.faq.p1![0]!;
  assert.deepEqual(f1.question_i18n, { es: "¿Cuánto duran?", en: "How long do they last?" });
  assert.deepEqual(f1.answer_i18n, { es: "Tres semanas.", en: "Three weeks." });
  // The row nobody listed is untouched.
  assert.deepEqual(db.offerings.p1![1]!.title_i18n, {});
  // The backup holds the OLD values of the touched rows only.
  const backup = calls.backups[0] as { profiles: Array<{ talent_offerings: Array<{ id: string; title_i18n: unknown }>; talent_faq_items: Array<{ id: string }> }> };
  assert.deepEqual(backup.profiles[0]!.talent_offerings.map((r) => r.id), ["o1"]);
  assert.deepEqual(backup.profiles[0]!.talent_offerings[0]!.title_i18n, { es: "Pestañas clásicas" });
  assert.deepEqual(backup.profiles[0]!.talent_faq_items.map((r) => r.id), ["f1"]);
});

test("a non-empty en is never overwritten", async () => {
  const db = baseDb();
  db.offerings.p1![0]!.title_i18n = { es: "Pestañas clásicas", en: "Lash set (mine)" };
  db.faq.p1![0]!.answer_i18n = { es: "Tres semanas.", en: "About three weeks." };
  const { io, calls } = fakeIo(db);
  const l = lines();
  const res = await run(["--apply", "--yes"], io, l.log, opts());
  assert.equal(res.exitCode, 0);
  assert.deepEqual(db.offerings.p1![0]!.title_i18n, { es: "Pestañas clásicas", en: "Lash set (mine)" });
  assert.deepEqual(db.faq.p1![0]!.answer_i18n, { es: "Tres semanas.", en: "About three weeks." });
  for (const w of calls.writes) {
    assert.ok(!("title_i18n" in w.patch));
    assert.ok(!("answer_i18n" in w.patch));
  }
  assert.match(l.out.join("\n"), /title_i18n: skip \(en exists\)/);
});

test("an empty or blank en is filled", async () => {
  const db = baseDb();
  db.offerings.p1![0]!.title_i18n = { es: "Pestañas clásicas", en: "  " };
  const { io } = fakeIo(db);
  await run(["--apply", "--yes"], io, () => {}, opts());
  assert.deepEqual(db.offerings.p1![0]!.title_i18n, { es: "Pestañas clásicas", en: "Classic lashes" });
});

test("es is never touched, and a row with no es key keeps none", async () => {
  const db = baseDb();
  db.offerings.p1![0]!.title_i18n = null; // plain column only
  const { io } = fakeIo(db);
  const res = await run(["--apply", "--yes"], io, () => {}, opts());
  assert.equal(res.exitCode, 0);
  assert.deepEqual(db.offerings.p1![0]!.title_i18n, { en: "Classic lashes" });
  assert.equal(db.offerings.p1![0]!.title, "Pestañas clásicas");
});

test("matching is by Spanish text, trimmed and case-insensitive, never by position", async () => {
  const db = baseDb();
  db.offerings.p1 = [
    { id: "oB", title: "  PESTAÑAS   clásicas ", description: null, category: null, title_i18n: {}, description_i18n: {}, category_i18n: {} },
  ];
  db.faq.p1 = [];
  const { io } = fakeIo(db);
  await run(["--apply", "--yes"], io, () => {}, opts());
  assert.deepEqual(db.offerings.p1![0]!.title_i18n, { en: "Classic lashes" });
});

test("a text field whose Spanish differs from the reviewed source is reported, not written", async () => {
  const db = baseDb();
  db.faq.p1![0]!.answer = "Cuatro semanas.";
  db.faq.p1![0]!.answer_i18n = { es: "Cuatro semanas." };
  const { io, calls } = fakeIo(db);
  const l = lines();
  await run(["--apply", "--yes"], io, l.log, opts());
  assert.deepEqual(db.faq.p1![0]!.answer_i18n, { es: "Cuatro semanas." });
  assert.match(l.out.join("\n"), /answer_i18n: unmatched ES "Cuatro semanas\." \(Spanish text differs/);
  assert.ok(calls.writes.every((w) => !("answer_i18n" in w.patch)));
});

test("unmatched rows and unmatched content entries are reported", async () => {
  const db = baseDb();
  db.offerings.p1 = [{ id: "oX", title: "Servicio nuevo", description: null, category: "Rarezas", title_i18n: {}, description_i18n: {}, category_i18n: {} }];
  db.faq.p1 = [{ id: "fX", question: "¿Otra cosa?", answer: "Sí.", question_i18n: {}, answer_i18n: {} }];
  const { io, calls } = fakeIo(db);
  const l = lines();
  const res = await run(["--apply", "--yes"], io, l.log, opts());
  assert.equal(res.exitCode, 0);
  assert.equal(calls.writes.length, 0);
  const text = l.out.join("\n");
  assert.match(text, /talent_offerings oX: title_i18n: unmatched ES "Servicio nuevo"/);
  assert.match(text, /talent_offerings oX: category_i18n: unmatched ES "Rarezas"/);
  assert.match(text, /talent_faq_items fX: question_i18n: unmatched ES "¿Otra cosa\?"/);
  assert.match(text, /unmatched content entry \(no live row\): service "Pestañas clásicas"/);
  assert.match(text, /unmatched content entry \(no live row\): faq "¿Cuánto duran\?"/);
  assert.match(text, /Nothing to write/);
});

test("a malformed stored map is left alone", async () => {
  const db = baseDb();
  db.offerings.p1![0]!.title_i18n = ["not", "a", "map"];
  const { io } = fakeIo(db);
  const l = lines();
  await run(["--apply", "--yes"], io, l.log, opts());
  assert.deepEqual(db.offerings.p1![0]!.title_i18n, ["not", "a", "map"]);
  assert.match(l.out.join("\n"), /not a plain text map/);
});

test("verification failure after a write exits non-zero and names the backup", async () => {
  const db = baseDb();
  const { io } = fakeIo(db, { corruptWrites: true });
  const l = lines();
  const res = await run(["--apply", "--yes"], io, l.log, opts());
  assert.equal(res.exitCode, 1);
  assert.match(l.out.join("\n"), /VERIFY FAILED/);
  assert.match(l.out.join("\n"), /Restore from the backup: \/tmp\/backup\.json/);
});

test("a rerun after apply plans nothing (idempotent)", async () => {
  const db = baseDb();
  const { io } = fakeIo(db);
  await run(["--apply", "--yes"], io, () => {}, opts());
  const { io: io2, calls } = fakeIo(db);
  const l = lines();
  const res = await run(["--apply", "--yes"], io2, l.log, opts());
  assert.equal(res.exitCode, 0);
  assert.equal(calls.writes.length, 0);
  assert.deepEqual(res.touchedProfiles, []);
});

// ---------------------------------------------------------------- the shipped content

test("shipped content: English is present, has no em dash, and every service/FAQ carries its Spanish source", () => {
  for (const [code, c] of Object.entries(CONTENT)) {
    const all = [...c.services.flatMap((s) => [s.title, s.description]), ...c.categories, ...c.faq.flatMap((f) => [f.question, f.answer])];
    for (const b of all) {
      if (!b) continue;
      assert.ok(b.es.trim().length > 0 && b.en.trim().length > 0, `${code}: empty text`);
      assert.ok(!b.en.includes("—") && !b.en.includes("–"), `${code}: dash in "${b.en}"`);
    }
  }
});

// ---------------------------------------------------------------- the entry file

test("the entry file parses, writes only through the plans, and never deletes or upserts", () => {
  const src = readFileSync(join(HERE, "apply-demo-english-data.mts"), "utf8");
  const out = transformSync(src, { loader: "ts", format: "esm", target: "esnext" });
  assert.ok(out.code.length > 0);
  assert.doesNotMatch(src, /\.(delete|upsert|rpc)\(/);
  // Two updates (English seed, Renata description) and one insert (Sofia FAQ rows, --content-fixes only).
  assert.equal((src.match(/\.update\(/g) ?? []).length, 2);
  assert.equal((src.match(/\.insert\(/g) ?? []).length, 1);
  assert.match(src, /process\.exit\(result\.exitCode\)/);
});
