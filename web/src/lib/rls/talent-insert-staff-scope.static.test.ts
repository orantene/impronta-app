/**
 * TUL-1781: the staff INSERT policy on talent_profiles is dropped with no replacement (all app inserts are
 * service-role or SECURITY DEFINER RPCs). Static checks on the held migration and the migration set.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const VERSION = "20261231425300";
const MIG = join(process.cwd(), "..", "supabase", "migrations");
const file = join(MIG, "_pending_pm", `${VERSION}_talent_insert_staff_scope.sql`);
const sql = existsSync(file) ? readFileSync(file, "utf8") : "";
const code = sql.replace(/--.*$/gm, "");

function allMigrations() {
  const all: { v: string; name: string; text: string }[] = [];
  for (const d of [MIG, join(MIG, "_pending_pm")]) {
    for (const f of readdirSync(d)) {
      if (!/^\d{14}_.*\.sql$/.test(f)) continue;
      all.push({ v: f.slice(0, 14), name: f, text: readFileSync(join(d, f), "utf8").replace(/--.*$/gm, "") });
    }
  }
  return all.sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : 0));
}

test("held migration: in _pending_pm at the reserved version, idempotent, not in the applied set", () => {
  assert.ok(sql.length > 0, "migration file missing");
  assert.match(sql, /^-- TUL-1781/);
  assert.match(sql, /HELD: lives in _pending_pm/);
  assert.match(code, /DROP POLICY IF EXISTS talent_insert_staff ON public\.talent_profiles/);
  assert.equal(existsSync(join(MIG, `${VERSION}_talent_insert_staff_scope.sql`)), false);
});

test("migration drops the policy and creates no replacement or looser check", () => {
  assert.doesNotMatch(code, /CREATE POLICY/i);
  assert.doesNotMatch(code, /caller_is_staff_of_any_tenant|is_agency_staff/);
  assert.doesNotMatch(code, /talent_insert_self/, "self-insert path must be untouched");
});

test("the DROP sorts after every earlier definition of talent_insert_staff (415400 is superseded)", () => {
  const all = allMigrations();
  const defs = all.filter((f) => /CREATE POLICY talent_insert_staff ON public\.talent_profiles/.test(f.text));
  assert.ok(defs.length > 0);
  for (const d of defs) assert.ok(d.v < VERSION, `${d.name} defines talent_insert_staff at/after the DROP`);
});

test("no staff INSERT policy on talent_profiles is created at or after this version (only talent_insert_self may exist)", () => {
  for (const f of allMigrations().filter((x) => x.v >= VERSION)) {
    for (const m of f.text.matchAll(/CREATE POLICY\s+(\w+)\s+ON\s+(?:public\.)?talent_profiles\s+(?:AS\s+\w+\s+)?FOR\s+(INSERT|ALL)/gi)) {
      assert.equal(m[1], "talent_insert_self", `${f.name}: ${m[1]}`);
    }
  }
});
