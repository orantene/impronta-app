import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { transformSync } from "esbuild";

import { allEnglish, CONTENT, type TargetContent } from "./content";
import { sameJson } from "./guards";
import {
  readField,
  run,
  type Field,
  type Io,
  type OfferingRow,
  type PhotoRow,
  type ProfileRow,
  type Table,
} from "./plan";

const HERE = dirname(fileURLToPath(import.meta.url));

const PID = "11111111-1111-4111-8111-111111111111";
const OTHER_PID = "22222222-2222-4222-8222-222222222222";

// ---------------------------------------------------------------- a fake database

interface FakeDb {
  profiles: Record<string, ProfileRow>;
  slugs: Record<string, string | null>;
  offerings: Record<string, OfferingRow[]>;
  photos: Record<string, PhotoRow[]>;
  files: Record<string, unknown>;
}

interface Calls {
  writes: Array<{ table: Table; profileId: string; id: string; field: Field; value: unknown }>;
  backups: Array<{ label: string; data: unknown; path: string }>;
}

function fakeIo(db: FakeDb, opts: { corrupt?: boolean; reorderKeys?: boolean } = {}): { io: Io; calls: Calls } {
  const calls: Calls = { writes: [], backups: [] };
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const io: Io = {
    async findProfile(code) { return db.profiles[code] ?? null; },
    async findSiteSlug(id) { return db.slugs[id] ?? null; },
    async listOfferings(id) { return clone(db.offerings[id] ?? []); },
    async listPhotos(id) { return clone(db.photos[id] ?? []); },
    async setField({ table, profileId, id, field, value }) {
      calls.writes.push({ table, profileId, id, field, value: clone(value) });
      if (table === "talent_offerings") {
        const row = db.offerings[profileId]?.find((r) => r.id === id) as unknown as Record<string, unknown> | undefined;
        if (!row) return { ok: false, error: "no row" };
        if (opts.corrupt) row[field] = { es: "changed" };
        else if (opts.reorderKeys && value && typeof value === "object") row[field] = Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse());
        else row[field] = clone(value);
        return { ok: true };
      }
      const row = db.photos[profileId]?.find((r) => r.id === id);
      if (!row) return { ok: false, error: "no row" };
      const meta = { ...((row.metadata as Record<string, unknown> | null) ?? {}) };
      if (value === null || value === undefined) delete meta.caption_i18n;
      else meta.caption_i18n = clone(value);
      row.metadata = meta;
      return { ok: true };
    },
    writeBackup(label, data) {
      const path = `/tmp/backup-${label}-${calls.backups.length}.json`;
      calls.backups.push({ label, data: clone(data), path });
      db.files[path] = clone(data);
      return path;
    },
    readBackup(path) {
      if (!(path in db.files)) throw new Error(`no such file ${path}`);
      return clone(db.files[path]);
    },
  };
  return { io, calls };
}

function offering(id: string, over: Partial<OfferingRow> = {}): OfferingRow {
  return { id, title: null, description: null, category: null, title_i18n: null, description_i18n: null, category_i18n: null, ...over };
}

function baseDb(): FakeDb {
  return {
    profiles: { "TAL-93900": { id: PID, profile_code: "TAL-93900" }, "TAL-93938": { id: OTHER_PID, profile_code: "TAL-93938" } },
    slugs: { [PID]: "jorg-beauty-qa", [OTHER_PID]: "book-jorgelina" },
    offerings: {
      [PID]: [
        offering("o1", { title: "Extensiones clásicas", title_i18n: { es: "Extensiones clásicas" }, description: "Una extensión por pestaña natural. Resultado natural, como rímel suave.", category: "Pestañas", category_i18n: { es: "Pestañas" } }),
        offering("o2", { title: "Lifting de pestañas", title_i18n: { es: "Lifting de pestañas", en: "Lash lift (hers)" }, category: "pestanas" }),
        offering("o3", { title: "Servicio raro", category: "Uñas" }),
        offering("o4", { title: "Perfilado", description: "Una descripción que ella reescribió.", category: "Cejas", category_i18n: { es: "Cejas", fr: "Sourcils" } }),
      ],
    },
    photos: {
      [PID]: [
        { id: "p1", metadata: { caption: "Extensiones clásicas", albumId: "a1", note: "keep" } },
        { id: "p2", metadata: { caption: "Lifting de pestañas", caption_i18n: { en: "Lash lift!" } } },
        { id: "p3", metadata: { caption: "Foto sin traducción conocida" } },
        { id: "p4", metadata: { albumId: "a1" } },
        { id: "p5", metadata: null },
      ],
    },
    files: {},
  };
}

const quiet = () => { const lines: string[] = []; return { lines, log: (l: string) => lines.push(l) }; };

// ---------------------------------------------------------------- guards: refused before any read or write

for (const argv of [
  ["--apply"],
  ["--apply", "--site", "TAL-93938"],
  ["--apply", "--site", "TAL-93901"],
  ["--apply", "--site", "TAL-93939"],
  ["--apply", "--site", "TAL-12345"],
  ["--apply", "--all"],
  ["--all"],
  ["--site", "TAL-93938"],
  ["--site", "book-jorgelina"],
  ["--yes"],
  ["--profile", "TAL-93900"],
  ["--apply", "--site", ""],
  ["--expect-profile-id", "not-a-uuid"],
  ["--restore", "", "--apply", "--site", "TAL-93900"],
]) {
  test(`refused with exit non-zero and no read or write: ${argv.join(" ")}`, async () => {
    const db = baseDb();
    const { io, calls } = fakeIo(db);
    let reads = 0;
    const counted: Io = { ...io, findProfile: async (c) => { reads++; return io.findProfile(c); } };
    const { lines, log } = quiet();
    const res = await run(argv, counted, log);
    assert.notEqual(res.exitCode, 0);
    assert.equal(res.mode, "refused");
    assert.equal(reads, 0, "argument refusals happen before the first database read");
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.backups.length, 0);
    assert.ok(lines.some((l) => l.startsWith("REFUSED")));
  });
}

test("a database that resolves TAL-93900 to the wrong slug is refused", async () => {
  const db = baseDb();
  db.slugs[PID] = "book-jorgelina";
  const { io, calls } = fakeIo(db);
  const res = await run(["--apply", "--site", "TAL-93900"], io, () => {});
  assert.equal(res.exitCode, 2);
  assert.equal(calls.writes.length, 0);
  db.slugs[PID] = null;
  assert.equal((await run(["--apply", "--site", "TAL-93900"], io, () => {})).exitCode, 2);
});

test("a database that returns another profile code for the request is refused", async () => {
  const db = baseDb();
  db.profiles["TAL-93900"] = { id: OTHER_PID, profile_code: "TAL-93938" };
  db.slugs[OTHER_PID] = "jorg-beauty-qa";
  const { io, calls } = fakeIo(db);
  const res = await run(["--apply", "--site", "TAL-93900"], io, () => {});
  assert.equal(res.exitCode, 2);
  assert.equal(calls.writes.length, 0);
});

test("--expect-profile-id must equal the resolved id", async () => {
  const { io, calls } = fakeIo(baseDb());
  const bad = await run(["--apply", "--site", "TAL-93900", "--expect-profile-id", OTHER_PID], io, () => {});
  assert.equal(bad.exitCode, 2);
  assert.equal(calls.writes.length, 0);
  const good = await run(["--site", "TAL-93900", "--expect-profile-id", PID], io, () => {});
  assert.equal(good.exitCode, 0);
});

test("a profile that does not exist is refused", async () => {
  const db = baseDb();
  delete db.profiles["TAL-93900"];
  const { io } = fakeIo(db);
  assert.equal((await run(["--site", "TAL-93900"], io, () => {})).exitCode, 2);
});

// ---------------------------------------------------------------- dry run

test("the dry run prints code, id and slug first, writes nothing, lists needs-English rows and unused entries", async () => {
  const db = baseDb();
  const before = JSON.stringify(db);
  const { io, calls } = fakeIo(db);
  const { lines, log } = quiet();
  const res = await run([], io, log);
  assert.equal(res.exitCode, 0);
  assert.equal(res.mode, "dry-run");
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.backups.length, 0);
  assert.equal(JSON.stringify(db), before);
  assert.equal(lines[0], `Target: code=TAL-93900 id=${PID} site=jorg-beauty-qa`);
  const text = lines.join("\n");
  assert.match(text, /talent_offerings o1: title_i18n: ES "Extensiones clásicas" -> add EN "Classic extensions"/);
  assert.match(text, /talent_offerings o1: category_i18n: ES "Pestañas" -> add EN "Lashes"/);
  assert.match(text, /media_assets p1: metadata.caption_i18n: ES "Extensiones clásicas" -> add EN "Classic extensions"/);
  assert.match(text, /talent_offerings o2: title_i18n: skip \(en exists\)/);
  assert.match(text, /talent_offerings o3: title_i18n: NEEDS ENGLISH, ES "Servicio raro"/);
  assert.match(text, /talent_offerings o4: description_i18n: NEEDS ENGLISH, ES "Una descripción que ella reescribió\."/);
  assert.match(text, /media_assets p3: metadata.caption_i18n: NEEDS ENGLISH, ES "Foto sin traducción conocida"/);
  assert.match(text, /unused content entry .*: caption "Ojo de gato"/);
  assert.match(text, /Dry run only/);
});

test("matching is by Spanish text, case and accent insensitive, never by position", async () => {
  const db = baseDb();
  db.offerings[PID] = [
    offering("z9", { title: "  EXTENSIONES   clasicas ", category: "PESTANAS" }),
    offering("z1", { title: "Lifting de pestañas" }),
  ];
  const { io } = fakeIo(db);
  const { lines, log } = quiet();
  await run([], io, log);
  const text = lines.join("\n");
  assert.match(text, /talent_offerings z9: title_i18n: ES "  EXTENSIONES   clasicas " -> add EN "Classic extensions"/);
  assert.match(text, /talent_offerings z9: category_i18n: .*add EN "Lashes"/);
  assert.match(text, /talent_offerings z1: title_i18n: .*add EN "Lash lift"/);
});

test("the spec's examples are in the content", () => {
  const cat = (es: string) => CONTENT.categories.find((c) => c.es.includes(es))?.en;
  assert.equal(cat("Pestañas"), "Lashes");
  assert.equal(cat("Uñas"), "Nails");
  assert.equal(cat("Cejas"), "Brows");
  const cap = (es: string) => CONTENT.captions.find((c) => c.es.includes(es))?.en;
  assert.equal(cap("Extensiones clásicas"), "Classic extensions");
  assert.equal(cap("Lifting de pestañas"), "Lash lift");
});

// ---------------------------------------------------------------- apply

test("apply: backup first, then only the en key is added, then verify passes (key-order insensitive)", async () => {
  for (const reorderKeys of [false, true]) {
    const db = baseDb();
    const original = JSON.parse(JSON.stringify(db)) as FakeDb;
    const { io, calls } = fakeIo(db, { reorderKeys });
    const { lines, log } = quiet();
    const res = await run(["--apply", "--site", "TAL-93900"], io, log);
    assert.equal(res.exitCode, 0, lines.join("\n"));
    assert.equal(res.mode, "apply");

    // Backup came before the first write and holds the old value of every changed field.
    assert.equal(calls.backups.length, 1);
    assert.ok(res.backupPath);
    const backup = calls.backups[0]!.data as { fields: Array<{ id: string; field: string; before: unknown }>; profile: { code: string; id: string; siteSlug: string } };
    assert.deepEqual(backup.profile, { code: "TAL-93900", id: PID, siteSlug: "jorg-beauty-qa" });
    assert.equal(backup.fields.length, calls.writes.length);
    assert.deepEqual(backup.fields.find((f) => f.id === "o1" && f.field === "category_i18n")?.before, { es: "Pestañas" });
    assert.equal(backup.fields.find((f) => f.id === "o3" && f.field === "title_i18n"), undefined);

    // Every write is keyed by row id AND this profile id.
    for (const w of calls.writes) assert.equal(w.profileId, PID);

    // Only en was added; es, other keys and other columns are untouched.
    const o1 = db.offerings[PID]!.find((r) => r.id === "o1")!;
    assert.deepEqual(o1.title_i18n, { es: "Extensiones clásicas", en: "Classic extensions" });
    assert.equal(o1.title, "Extensiones clásicas");
    assert.equal(o1.description, "Una extensión por pestaña natural. Resultado natural, como rímel suave.");
    const o4 = db.offerings[PID]!.find((r) => r.id === "o4")!;
    assert.deepEqual(o4.category_i18n, { es: "Cejas", fr: "Sourcils", en: "Brows" });
    const o2 = db.offerings[PID]!.find((r) => r.id === "o2")!;
    assert.deepEqual(o2.title_i18n, { es: "Lifting de pestañas", en: "Lash lift (hers)" }, "a non-empty en is never overwritten");
    const o3 = db.offerings[PID]!.find((r) => r.id === "o3")!;
    assert.equal(o3.title_i18n, null, "an unknown Spanish title is never invented");
    assert.deepEqual(o3.category_i18n, { en: "Nails" });
    assert.equal(o3.title, original.offerings[PID]!.find((r) => r.id === "o3")!.title);

    const p1 = db.photos[PID]!.find((r) => r.id === "p1")!;
    assert.deepEqual(p1.metadata, { caption: "Extensiones clásicas", albumId: "a1", note: "keep", caption_i18n: { en: "Classic extensions" } });
    const p2 = db.photos[PID]!.find((r) => r.id === "p2")!;
    assert.deepEqual((p2.metadata as { caption_i18n: unknown }).caption_i18n, { en: "Lash lift!" }, "existing en caption kept");
    assert.deepEqual(db.photos[PID]!.find((r) => r.id === "p3"), original.photos[PID]!.find((r) => r.id === "p3"));
    assert.deepEqual(db.photos[PID]!.find((r) => r.id === "p5"), original.photos[PID]!.find((r) => r.id === "p5"));

    // Nothing was written for the other talent.
    assert.deepEqual(db.offerings[OTHER_PID] ?? [], []);
  }
});

test("apply: a write that does not land fails the run with exit 1 and points at the backup", async () => {
  const db = baseDb();
  const { io } = fakeIo(db, { corrupt: true });
  const { lines, log } = quiet();
  const res = await run(["--apply", "--site", "TAL-93900"], io, log);
  assert.equal(res.exitCode, 1);
  assert.match(lines.join("\n"), /VERIFY FAILED/);
  assert.match(lines.join("\n"), /Restore from the backup/);
});

test("apply twice is idempotent: the second run writes nothing", async () => {
  const db = baseDb();
  const { io, calls } = fakeIo(db);
  await run(["--apply", "--site", "TAL-93900"], io, () => {});
  const writes = calls.writes.length;
  const again = await run(["--apply", "--site", "TAL-93900"], io, () => {});
  assert.equal(again.exitCode, 0);
  assert.equal(calls.writes.length, writes);
});

test("a stored value that is not a plain text map is left alone and reported", async () => {
  const db = baseDb();
  db.offerings[PID] = [offering("w1", { title: "Cejas", title_i18n: { es: "Cejas", en: 5 } as unknown as Record<string, string> })];
  const { io, calls } = fakeIo(db);
  const { lines, log } = quiet();
  db.photos[PID] = [];
  const res = await run(["--apply", "--site", "TAL-93900"], io, log);
  assert.equal(res.exitCode, 0, lines.join("\n"));
  assert.equal(calls.writes.length, 0);
  assert.match(lines.join("\n"), /not a plain text map/);
});

// ---------------------------------------------------------------- restore

test("restore: dry run by default, then puts exactly the changed fields back", async () => {
  const db = baseDb();
  const original = JSON.parse(JSON.stringify(db)) as FakeDb;
  const { io, calls } = fakeIo(db);
  const applied = await run(["--apply", "--site", "TAL-93900"], io, () => {});
  const file = applied.backupPath as string;
  const writesAfterApply = calls.writes.length;

  // Dry run: nothing written.
  const dry = await run(["--restore", file], io, () => {});
  assert.equal(dry.exitCode, 0);
  assert.equal(dry.mode, "restore-dry-run");
  assert.equal(calls.writes.length, writesAfterApply);

  // --apply without --site is refused.
  const noSite = await run(["--restore", file, "--apply"], io, () => {});
  assert.equal(noSite.exitCode, 2);
  assert.equal(calls.writes.length, writesAfterApply);

  const { lines, log } = quiet();
  const res = await run(["--restore", file, "--apply", "--site", "TAL-93900"], io, log);
  assert.equal(res.exitCode, 0, lines.join("\n"));
  assert.equal(res.mode, "restore");
  assert.ok(calls.backups.some((b) => b.label === "restore-undo"), "the values being replaced are backed up too");
  for (const t of ["offerings", "photos"] as const) {
    const now = db[t][PID] as Array<{ id: string }>;
    const was = original[t][PID] as Array<{ id: string }>;
    for (const r of was) assert.ok(sameJson(now.find((x) => x.id === r.id), r), `${t} ${r.id} is back as it was`);
  }
});

test("restore: a field edited after the fill is NOT overwritten, and the run exits 1", async () => {
  const db = baseDb();
  const { io } = fakeIo(db);
  const applied = await run(["--apply", "--site", "TAL-93900"], io, () => {});
  const o1 = db.offerings[PID]!.find((r) => r.id === "o1")!;
  o1.title_i18n = { es: "Extensiones clásicas", en: "Classic extensions, edited by her" };
  const { lines, log } = quiet();
  const res = await run(["--restore", applied.backupPath as string, "--apply", "--site", "TAL-93900"], io, log);
  assert.equal(res.exitCode, 1);
  assert.match(lines.join("\n"), /changed since this script wrote it; NOT restored/);
  assert.deepEqual(o1.title_i18n, { es: "Extensiones clásicas", en: "Classic extensions, edited by her" });
});

test("restore: a backup for another profile or a malformed file is refused", async () => {
  const db = baseDb();
  const { io, calls } = fakeIo(db);
  const applied = await run(["--apply", "--site", "TAL-93900"], io, () => {});
  const good = JSON.parse(JSON.stringify(db.files[applied.backupPath as string])) as { profile: { id: string; code: string }; fields: Array<{ profileId: string; table: string }> };
  const writes = calls.writes.length;

  db.files["/x/other-id.json"] = { ...good, profile: { ...good.profile, id: OTHER_PID } };
  db.files["/x/other-code.json"] = { ...good, profile: { ...good.profile, code: "TAL-93938" } };
  db.files["/x/foreign-field.json"] = { ...good, fields: good.fields.map((f, i) => (i === 0 ? { ...f, profileId: OTHER_PID } : f)) };
  db.files["/x/bad-table.json"] = { ...good, fields: good.fields.map((f, i) => (i === 0 ? { ...f, table: "talent_profiles" } : f)) };
  db.files["/x/garbage.json"] = { hello: "world" };
  for (const p of ["other-id", "other-code", "foreign-field", "bad-table", "garbage"]) {
    const res = await run(["--restore", `/x/${p}.json`, "--apply", "--site", "TAL-93900"], io, () => {});
    assert.equal(res.exitCode, 2, p);
  }
  assert.equal(calls.writes.length, writes);
});

// ---------------------------------------------------------------- content

test("content: no em dashes, no duplicate Spanish, every English present", () => {
  for (const s of allEnglish()) {
    for (const code of [0x2014, 0x2013]) assert.ok(!s.includes(String.fromCharCode(code)), `dash in "${s}"`);
    assert.ok(s.trim().length > 0);
  }
  assert.equal(CONTENT.siteSlug, "jorg-beauty-qa");
});

test("content with a duplicate Spanish key or the wrong slug is refused", async () => {
  const { io } = fakeIo(baseDb());
  const dup: TargetContent = { ...CONTENT, categories: [...CONTENT.categories, { es: ["uñas"], en: "Nails again" }] };
  assert.equal((await run([], io, () => {}, { content: dup })).exitCode, 2);
  const wrong: TargetContent = { ...CONTENT, siteSlug: "book-jorgelina" };
  assert.equal((await run([], io, () => {}, { content: wrong })).exitCode, 2);
});

test("readField reads the same places the editors write", () => {
  assert.deepEqual(readField("metadata.caption_i18n", { id: "x", metadata: { caption_i18n: { en: "a" } } }), { en: "a" });
  assert.equal(readField("metadata.caption_i18n", { id: "x", metadata: null }), undefined);
  assert.deepEqual(readField("title_i18n", offering("o", { title_i18n: { es: "a" } })), { es: "a" });
});

// ---------------------------------------------------------------- the entry file

test("the entry file parses, writes only through the plan, and never deletes, upserts or inserts", () => {
  const src = readFileSync(join(HERE, "apply-en-content-fill.mts"), "utf8");
  const out = transformSync(src, { loader: "ts", format: "esm", target: "esnext" });
  assert.ok(out.code.length > 0);
  assert.doesNotMatch(src, /\.(delete|upsert|insert|rpc)\(/);
  assert.equal((src.match(/\.update\(/g) ?? []).length, 2, "one offering column update and one media metadata update");
  // Every write is keyed by row id AND the profile id.
  assert.equal((src.match(/\.eq\("talent_profile_id", profileId\)/g) ?? []).length, 3, "site read, offerings list and offering update are scoped by profile");
  assert.equal((src.match(/\.eq\("owner_talent_profile_id", profileId\)/g) ?? []).length, 3, "media list, media read and media update are scoped by owner");
  assert.match(src, /process\.exit\(result\.exitCode\)/);
  assert.doesNotMatch(src, /\bany\b/);
});
