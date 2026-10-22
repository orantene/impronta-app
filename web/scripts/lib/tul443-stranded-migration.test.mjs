// TUL-443: static pins for the held "migrate stranded talents" migration.
// Run: node --test scripts/lib/tul443-stranded-migration.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const FILE = new URL(
  "../../../supabase/migrations/_pending_pm/20261231431100_migrate_stranded_disabled_taxonomy_holders_tul443.sql",
  import.meta.url,
);
const sql = readFileSync(FILE, "utf8");
const code = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

test("migration is held in _pending_pm and versioned after 20261231431000", () => {
  assert.ok(existsSync(FILE));
  const v = FILE.pathname.match(/(\d{14})_/)[1];
  assert.ok(BigInt(v) > 20261231431000n);
  assert.ok(!existsSync(new URL(`../../../supabase/migrations/${FILE.pathname.split("/").pop()}`, import.meta.url)));
});

test("backup table is created and filled BEFORE any change to talent_profile_taxonomy", () => {
  const create = code.indexOf("CREATE TABLE IF NOT EXISTS pmm_backup.tul443_backup");
  const backup = code.indexOf("INSERT INTO pmm_backup.tul443_backup");
  const update = code.indexOf("UPDATE public.talent_profile_taxonomy");
  const del = code.indexOf("DELETE FROM public.talent_profile_taxonomy");
  assert.ok(create >= 0 && backup > create);
  assert.ok(update > backup, "UPDATE must come after the backup insert");
  assert.ok(del > backup, "DELETE must come after the backup insert");
});

test("only STRANDED talents are touched", () => {
  const work = code.slice(code.indexOf("CREATE TEMP TABLE tul443_work"), code.indexOf("INSERT INTO pmm_backup.tul443_backup"));
  assert.match(work, /NOT EXISTS \(\s*-- STRANDED/);
  assert.match(work, /is_enabled = false/);
  assert.match(work, /ro\.status = 'active'/);
  assert.match(work, /target must itself be active/);
  // every write is driven by the stranded work table, never a bare scan of the table
  assert.match(code, /FOR r IN SELECT \* FROM tul443_work/);
  assert.doesNotMatch(code, /DELETE FROM public\.talent_profile_taxonomy\s+WHERE (?!talent_profile_id = r\.talent_profile_id)/);
});

test("mapping table is present with confidence tiers and the staging holders", () => {
  const rows = [...code.matchAll(/^\s+\('([a-z0-9-]+)','([a-z0-9-]+)','(exact|close|category)',/gm)];
  assert.ok(rows.length >= 50, `mapping rows: ${rows.length}`);
  const map = new Map(rows.map((m) => [m[1], m[2]]));
  assert.equal(map.get("barber"), "hair-stylist");
  assert.equal(map.get("3d-designer"), "motion-graphics-artist");
  assert.equal(map.get("esthetician"), "skincare-specialist");
  assert.equal(new Set(rows.map((m) => m[1])).size, rows.length, "no duplicate source slug");
  for (const [from, to] of map) assert.notEqual(from, to);
  assert.ok(![...map.values()].some((to) => map.has(to)), "a target must not itself be a switched-off source");
});

test("rollback block and no data-destroying statements beyond the row swap", () => {
  assert.match(sql, /-- ROLLBACK/);
  assert.match(sql, /pmm_backup\.tul443_backup/);
  assert.doesNotMatch(code, /\b(TRUNCATE|DROP TABLE|DROP SCHEMA)\b/i);
});

test("report script reads the same mapping and stays read-only", () => {
  const rep = readFileSync(new URL("../report-disabled-taxonomy-holders.mjs", import.meta.url), "utf8");
  assert.match(rep, /20261231431100_migrate_stranded_disabled_taxonomy_holders_tul443\.sql/);
  assert.doesNotMatch(rep, /\.(insert|update|delete|upsert|rpc)\(/);
});
