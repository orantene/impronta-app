import assert from "node:assert/strict";
import { test } from "node:test";

import { addEnglishLine, ALBA_TAGLINE, ALBA_TAGLINE_EN, HERO_FACTS } from "../../src/lib/talent-site/demos/hero-facts";
import { finishedDemoSecondaryLocales } from "../../src/lib/talent-site/demos/finished-demo-locales";
import { run, TARGETS, type HeroKey, type Io, type ProfileRow } from "./finished-demos-en";

interface Db {
  profiles: Record<string, ProfileRow>;
  slugs: Record<string, string | null>;
  maps: Record<string, Partial<Record<HeroKey, unknown>>>;
}

function fakeDb(): Db {
  const profiles: Db["profiles"] = {};
  const slugs: Db["slugs"] = {};
  for (const t of TARGETS) {
    profiles[t.profileCode] = { id: `id-${t.profileCode}`, profile_code: t.profileCode, is_demo: true, preferred_locale: "es", secondary_locales: [] };
    slugs[`id-${t.profileCode}`] = t.siteSlug;
  }
  return { profiles, slugs, maps: {} };
}

function fakeIo(db: Db): { io: Io; writes: string[]; backups: unknown[] } {
  const writes: string[] = [];
  const backups: unknown[] = [];
  let stored: unknown = null;
  const byId = (id: string) => Object.values(db.profiles).find((p) => p.id === id)!;
  const io: Io = {
    async findProfile(code) { return db.profiles[code] ?? null; },
    async findSiteSlug(id) { return db.slugs[id] ?? null; },
    async readHeroMap(id, key) { return db.maps[id]?.[key]; },
    async setSecondaryLocales(id, value) { writes.push(`sec:${byId(id).profile_code}`); byId(id).secondary_locales = value; return { ok: true }; },
    async setHeroMap(id, key, value) {
      writes.push(`${key}:${byId(id).profile_code}`);
      const m = (db.maps[id] ??= {});
      if (value === null) delete m[key];
      else m[key] = value;
      return { ok: true };
    },
    writeBackup(data) { stored = JSON.parse(JSON.stringify(data)); backups.push(stored); return "/tmp/b.json"; },
    readBackup() { return stored; },
  };
  return { io, writes, backups };
}

test("hero facts carry faithful English lines for the Spanish entries", () => {
  assert.equal(HERO_FACTS["TAL-93020"]?.headlineEn, "Hands that speak for you.");
  assert.equal(HERO_FACTS["TAL-93020"]?.taglineEn, ALBA_TAGLINE_EN);
  assert.notEqual(ALBA_TAGLINE_EN, ALBA_TAGLINE);
  for (const code of ["TAL-93002", "TAL-93003", "TAL-93105"]) assert.ok(HERO_FACTS[code]?.headlineEn, code);
});

test("addEnglishLine is add-only", () => {
  assert.deepEqual(addEnglishLine(undefined, "Hi"), { en: "Hi" });
  assert.deepEqual(addEnglishLine({ es: "Hola" }, "Hi"), { es: "Hola", en: "Hi" });
  assert.equal(addEnglishLine({ es: "Hola", en: "Mine" }, "Hi"), null);
  assert.equal(addEnglishLine({}, undefined), null);
  assert.equal(addEnglishLine({}, "  "), null);
});

test("finishedDemoSecondaryLocales: every empty Spanish-primary demo gets en (TUL-488)", () => {
  const base = { theme: "folio", preferredLocale: "es", currentSecondary: [] as string[] };
  assert.deepEqual(finishedDemoSecondaryLocales(base), ["en"]);
  assert.deepEqual(finishedDemoSecondaryLocales({ ...base, theme: "gridline", currentSecondary: null }), ["en"]);
  assert.deepEqual(finishedDemoSecondaryLocales({ ...base, theme: "solace" }), ["en"]);
  assert.deepEqual(finishedDemoSecondaryLocales({ ...base, theme: "frame" }), ["en"]);
  assert.deepEqual(finishedDemoSecondaryLocales({ preferredLocale: "es", currentSecondary: [] }), ["en"]);
  assert.equal(finishedDemoSecondaryLocales({ ...base, preferredLocale: "en" }), null);
  assert.equal(finishedDemoSecondaryLocales({ ...base, currentSecondary: ["fr"] }), null);
});

test("dry run writes nothing and prints code, id and slug", async () => {
  const db = fakeDb();
  const { io, writes } = fakeIo(db);
  const r = await run([], io);
  assert.equal(r.exitCode, 0);
  assert.equal(writes.length, 0);
  assert.ok(r.lines.some((l) => l.startsWith("TAL-93003 id=id-TAL-93003 site=camila-nails")));
});

test("--apply without --yes is refused", async () => {
  const { io, writes } = fakeIo(fakeDb());
  const r = await run(["--apply"], io);
  assert.equal(r.exitCode, 2);
  assert.equal(writes.length, 0);
});

test("apply sets en, adds hero lines, backs up first; second run is idempotent", async () => {
  const db = fakeDb();
  db.maps["id-TAL-93020"] = { headline_i18n: { es: "Manos que hablan por ti." } };
  const { io, writes, backups } = fakeIo(db);
  const r = await run(["--apply", "--yes"], io);
  assert.equal(r.exitCode, 0);
  assert.equal(backups.length, 1);
  assert.deepEqual(db.profiles["TAL-93003"]!.secondary_locales, ["en"]);
  assert.deepEqual(db.maps["id-TAL-93020"]!.headline_i18n, { es: "Manos que hablan por ti.", en: "Hands that speak for you." });
  assert.deepEqual(db.maps["id-TAL-93020"]!.tagline_i18n, { en: ALBA_TAGLINE_EN });
  const first = writes.length;
  const again = await run(["--apply", "--yes"], io);
  assert.equal(again.exitCode, 0);
  assert.equal(writes.length, first);
});

test("never overwrites a non-empty English value or a secondary list already set", async () => {
  const db = fakeDb();
  db.maps["id-TAL-93020"] = { headline_i18n: { en: "Mine" } };
  db.profiles["TAL-93011"]!.secondary_locales = ["fr"];
  const { io } = fakeIo(db);
  await run(["--apply", "--yes"], io);
  assert.deepEqual(db.maps["id-TAL-93020"]!.headline_i18n, { en: "Mine" });
  assert.deepEqual(db.profiles["TAL-93011"]!.secondary_locales, ["fr"]);
});

test("an English-primary profile keeps its locales", async () => {
  const db = fakeDb();
  db.profiles["TAL-93030"]!.preferred_locale = "en";
  const { io } = fakeIo(db);
  await run(["--apply", "--yes"], io);
  assert.deepEqual(db.profiles["TAL-93030"]!.secondary_locales, []);
});

test("refuses real and test talents, off-list codes, non-demo profiles and slug mismatch", async () => {
  for (const code of ["TAL-93938", "TAL-93900", "TAL-90000"]) {
    const { io, writes } = fakeIo(fakeDb());
    const r = await run(["--only", code, "--apply", "--yes"], io);
    assert.equal(r.exitCode, 2, code);
    assert.equal(writes.length, 0);
  }
  const notDemo = fakeDb();
  notDemo.profiles["TAL-93011"]!.is_demo = false;
  const a = fakeIo(notDemo);
  assert.equal((await run(["--apply", "--yes"], a.io)).exitCode, 2);
  assert.equal(a.writes.length, 0);

  const wrongSlug = fakeDb();
  wrongSlug.slugs["id-TAL-93003"] = "someone-else";
  const b = fakeIo(wrongSlug);
  assert.equal((await run(["--apply", "--yes"], b.io)).exitCode, 2);
  assert.equal(b.writes.length, 0);
});

test("--restore puts back exactly the backed-up values, incl. removing a row that did not exist", async () => {
  const db = fakeDb();
  db.maps["id-TAL-93020"] = { headline_i18n: { es: "Manos que hablan por ti." } };
  const { io } = fakeIo(db);
  await run(["--apply", "--yes"], io);
  const dry = await run(["--restore", "/tmp/b.json"], io);
  assert.equal(dry.exitCode, 0);
  assert.deepEqual(db.profiles["TAL-93003"]!.secondary_locales, ["en"]);
  const r = await run(["--restore", "/tmp/b.json", "--apply", "--yes"], io);
  assert.equal(r.exitCode, 0);
  assert.deepEqual(db.profiles["TAL-93003"]!.secondary_locales, []);
  assert.deepEqual(db.maps["id-TAL-93020"]!.headline_i18n, { es: "Manos que hablan por ti." });
  assert.equal(db.maps["id-TAL-93020"]!.tagline_i18n, undefined);
});

test("--restore refuses a backup whose id does not match the profile", async () => {
  const db = fakeDb();
  const { io } = fakeIo(db);
  await run(["--apply", "--yes"], io);
  db.profiles["TAL-93003"]!.id = "other-id";
  db.slugs["other-id"] = "camila-nails";
  const r = await run(["--restore", "/tmp/b.json", "--apply", "--yes"], io);
  assert.equal(r.exitCode, 2);
});
