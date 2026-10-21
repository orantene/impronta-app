/**
 * TUL-1781: talent_profiles INSERT by staff must be scoped to an ACTIVE editor-or-above member (or platform admin),
 * not to "staff of any tenant" (which admitted viewers). Static checks on the held migration.
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

test("held migration: exists in _pending_pm at the reserved version, idempotent", () => {
  assert.ok(sql.length > 0, "migration file missing");
  assert.match(sql, /^-- TUL-1781/);
  assert.match(sql, /HELD: lives in _pending_pm/);
  assert.match(code, /DROP POLICY IF EXISTS talent_insert_staff ON public\.talent_profiles/);
  assert.equal(existsSync(join(MIG, `${VERSION}_talent_insert_staff_scope.sql`)), false, "must not be in the applied set");
});

test("old looser check is gone from this migration", () => {
  assert.doesNotMatch(code, /caller_is_staff_of_any_tenant/);
  assert.doesNotMatch(code, /is_agency_staff\(\)/);
});

test("new policy: INSERT only, WITH CHECK, active editor-or-above membership, platform admin allowed", () => {
  const m = code.match(/CREATE POLICY talent_insert_staff ON public\.talent_profiles([\s\S]*?);/);
  assert.ok(m, "policy not created");
  const p = m[1];
  assert.match(p, /FOR INSERT\s+TO authenticated/);
  assert.match(p, /WITH CHECK/);
  assert.doesNotMatch(p, /\bUSING\b/);
  assert.match(p, /public\.is_platform_admin\(\)/);
  assert.match(p, /FROM public\.agency_memberships/);
  assert.match(p, /\.profile_id\s*=\s*auth\.uid\(\)/);
  assert.match(p, /\.status\s*=\s*'active'/);
  assert.match(p, /\.role IN \('owner', 'admin', 'manager', 'coordinator', 'editor'\)/);
  assert.doesNotMatch(p, /viewer|hub_moderator|platform_reviewer/);
});

test("self-insert path (talent_insert_self) is not touched", () => {
  assert.doesNotMatch(code, /talent_insert_self/);
});

test("no INSERT policy on talent_profiles gated only by caller_is_staff_of_any_tenant survives at/after this version", () => {
  const all: { v: string; name: string; text: string }[] = [];
  for (const d of [MIG, join(MIG, "_pending_pm")]) {
    for (const f of readdirSync(d)) {
      if (!/^\d{14}_.*\.sql$/.test(f)) continue;
      all.push({ v: f.slice(0, 14), name: f, text: readFileSync(join(d, f), "utf8").replace(/--.*$/gm, "") });
    }
  }
  all.sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : 0));
  // The last definition of talent_insert_staff in version order must be ours.
  const defs = all.filter((f) => /CREATE POLICY talent_insert_staff ON public\.talent_profiles/.test(f.text));
  assert.equal(defs[defs.length - 1]?.v, VERSION, "a later migration redefines talent_insert_staff");
  for (const f of all.filter((x) => x.v >= VERSION)) {
    assert.doesNotMatch(
      f.text,
      /CREATE POLICY \w+ ON public\.talent_profiles\s+FOR INSERT[^;]*caller_is_staff_of_any_tenant\(\)\s*\)?\s*;/,
      f.name,
    );
  }
});
