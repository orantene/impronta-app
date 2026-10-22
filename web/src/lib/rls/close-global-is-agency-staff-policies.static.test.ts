/**
 * TUL-1805: the global public.is_agency_staff() (true for staff of ANY tenant) must not gate these 13 policies on
 * 10 tables. Pins the held migration 20261231425600 and guards every later migration against reintroducing the
 * pattern. talent_profiles_merged_select_public is intentionally NOT handled here (held 417600 / TUL-1359 owns it).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const MIG = join(process.cwd(), "..", "supabase", "migrations");
const VERSION = 20261231425600;
const FIX_FILE = join(MIG, "_pending_pm", "20261231425600_close_global_is_agency_staff_policies.sql");

type Event = { version: number; file: string; kind: "create" | "drop"; table: string; name: string; body: string };

function strip(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

function files(): Array<{ file: string; version: number }> {
  const out: Array<{ file: string; version: number }> = [];
  for (const dir of [MIG, join(MIG, "_pending_pm")]) {
    for (const f of readdirSync(dir)) {
      const m = /^(\d+)_.*\.sql$/.exec(f);
      if (m) out.push({ file: join(dir, f), version: Number(m[1]) });
    }
  }
  return out.sort((a, b) => a.version - b.version || a.file.localeCompare(b.file));
}

function events(): Event[] {
  const out: Event[] = [];
  const re =
    /(CREATE\s+POLICY\s+"?([\w$]+)"?\s+ON\s+(?:"?public"?\.)?"?(\w+)"?([^;]*?);)|(DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([\w$]+)"?\s+ON\s+(?:"?public"?\.)?"?(\w+)"?\s*;)/gi;
  for (const { file, version } of files()) {
    const sql = strip(readFileSync(file, "utf8"));
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      if (m[1]) out.push({ version, file, kind: "create", table: m[3], name: m[2], body: m[4] });
      else out.push({ version, file, kind: "drop", table: m[7], name: m[6], body: "" });
    }
  }
  return out;
}

function last(table: string, name: string): Event {
  const hits = events().filter((e) => e.table === table && e.name === name);
  assert.ok(hits.length > 0, `${table}.${name} has no definition`);
  return hits[hits.length - 1];
}

const GLOBAL = /\bis_agency_staff\s*\(/i;

const POLICIES: Array<[string, string]> = [
  ["app_locales", "app_locales_write_staff"],
  ["countries", "countries_write_staff"],
  ["locations", "locations_write_staff"],
  ["taxonomy_terms", "taxonomy_write_staff"],
  ["staff_permissions", "staff_permissions_staff"],
  ["profile_revisions", "revisions_staff_all"],
  ["talent_embeddings", "talent_embeddings_staff_all"],
  ["app_locales", "app_locales_select_public"],
  ["guest_sessions", "guest_sessions_select_staff"],
  ["locations", "locations_select"],
  ["profile_revisions", "revisions_select"],
  ["talent_skill_metrics", "talent_skill_metrics_staff_select"],
  ["taxonomy_terms", "taxonomy_select_active"],
];

test("the fix is a held _pending_pm file at the reserved version", () => {
  const f = files().filter((x) => x.version === VERSION);
  assert.equal(f.length, 1);
  assert.ok(f[0].file.includes("_pending_pm"), "must stay held until the PMM applies it");
  assert.ok(f[0].file.endsWith("_close_global_is_agency_staff_policies.sql"));
});

test("after 425600, none of the 13 policies' last definition references is_agency_staff()", () => {
  for (const [table, name] of POLICIES) {
    const e = last(table, name);
    assert.ok(e.version >= VERSION, `${table}.${name} last defined before ${VERSION}: ${e.file}`);
    assert.ok(e.kind === "drop" || !GLOBAL.test(e.body), `${table}.${name} still uses is_agency_staff()`);
  }
});

test("global reference tables: writes need is_platform_admin() in USING and WITH CHECK", () => {
  for (const [table, name] of [
    ["countries", "countries_write_staff"],
    ["locations", "locations_write_staff"],
    ["taxonomy_terms", "taxonomy_write_staff"],
    ["app_locales", "app_locales_write_staff"],
  ]) {
    const b = last(table, name).body;
    assert.match(b, /FOR\s+ALL\s+TO\s+authenticated/i, name);
    assert.match(b, /USING\s*\(\s*public\.is_platform_admin\(\)\s*\)/i, `${name} USING`);
    assert.match(b, /WITH\s+CHECK\s*\(\s*public\.is_platform_admin\(\)\s*\)/i, `${name} WITH CHECK`);
    assert.doesNotMatch(b, /is_staff_of_tenant/i, name);
  }
});

test("staff_permissions: tenant staff with an active owner/admin role only", () => {
  // TUL-1813 (425800) supersedes 425600's single staff_permissions_staff policy with
  // per-command tenant-admin policies; the final state is what must hold.
  const superseded = events().some((e) => e.table === "staff_permissions" && e.name === "staff_permissions_select_tenant_admin");
  if (superseded) {
    assert.equal(last("staff_permissions", "staff_permissions_staff").body, "", "425800 drops the 425600 policy");
    for (const name of ["select", "insert", "update", "delete"].map((c) => `staff_permissions_${c}_tenant_admin`)) {
      assert.match(last("staff_permissions", name).body, /TO\s+authenticated/i, name);
    }
  } else {
    const b = last("staff_permissions", "staff_permissions_staff").body;
    assert.match(b, /TO\s+authenticated/i);
    assert.match(b, /USING\s*\(\s*public\.staff_is_admin_of_user_tenant\(user_id\)\s*\)/i);
    assert.match(b, /WITH\s+CHECK\s*\(\s*public\.staff_is_admin_of_user_tenant\(user_id\)\s*\)/i);
  }
  const sql = strip(readFileSync(FIX_FILE, "utf8"));
  const fn = /FUNCTION public\.staff_is_admin_of_user_tenant[\s\S]*?\$\$;/i.exec(sql);
  assert.ok(fn, "helper defined in the migration");
  assert.match(fn[0], /me\.profile_id\s*=\s*auth\.uid\(\)/);
  assert.match(fn[0], /me\.status\s*=\s*'active'/);
  assert.match(fn[0], /me\.role IN \('owner', 'admin'\)/);
  assert.match(fn[0], /them\.tenant_id\s*=\s*me\.tenant_id/);
  assert.match(fn[0], /is_platform_admin\(\)/);
});

test("tenant-scoped tables: reads use the roster helper, writes are per-command with WITH CHECK, none FOR ALL", () => {
  for (const [table, name] of [
    ["profile_revisions", "revisions_staff_all"],
    ["talent_embeddings", "talent_embeddings_staff_all"],
  ]) {
    assert.equal(last(table, name).kind, "drop", `${name} must end dropped (it was FOR ALL on a global flag)`);
  }
  assert.match(last("profile_revisions", "revisions_select").body, /staff_can_access_talent_profile\(talent_profile_id\)/);
  assert.match(last("profile_revisions", "revisions_select").body, /t\.user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(last("talent_skill_metrics", "talent_skill_metrics_staff_select").body, /staff_can_access_talent_profile\(talent_profile_id\)/);
  assert.match(last("guest_sessions", "guest_sessions_select_staff").body, /staff_can_read_guest_session\(id\)/);
  for (const [table, prefix] of [
    ["profile_revisions", "revisions_staff"],
    ["talent_embeddings", "talent_embeddings_staff"],
  ]) {
    for (const cmd of ["insert", "update", "delete"]) {
      const b = last(table, `${prefix}_${cmd}`).body;
      assert.match(b, new RegExp(`FOR\\s+${cmd}\\s+TO\\s+authenticated`, "i"));
      assert.match(b, /staff_can_write_talent_profile\(talent_profile_id\)/);
      if (cmd !== "delete") assert.match(b, /WITH\s+CHECK/i, `${prefix}_${cmd} needs WITH CHECK`);
      assert.doesNotMatch(b, /FOR\s+ALL/i);
    }
    assert.match(last(table, `${prefix}_select`.replace("revisions_staff_select", "revisions_select")).body, /staff_can_access_talent_profile/);
  }
  const sql = strip(readFileSync(FIX_FILE, "utf8"));
  const w = /FUNCTION public\.staff_can_write_talent_profile[\s\S]*?\$\$;/i.exec(sql);
  assert.ok(w);
  assert.match(w[0], /m\.status\s*=\s*'active'/);
  assert.doesNotMatch(w[0], /viewer/i, "viewers must not write");
});

test("public SELECT policies keep their public clause and lose only the staff branch", () => {
  const al = last("app_locales", "app_locales_select_public").body;
  assert.match(al, /TO\s+anon,\s*authenticated/i);
  assert.match(al, /USING\s*\(\s*enabled_public\s*=\s*TRUE\s*\)/i);
  assert.match(last("locations", "locations_select").body, /USING\s*\(\s*archived_at IS NULL\s*\)/i);
  assert.match(last("taxonomy_terms", "taxonomy_select_active").body, /USING\s*\(\s*archived_at IS NULL\s*\)/i);
});

test("talent_profiles_merged_select_public is left to held 417600 (not edited here)", () => {
  const sql = strip(readFileSync(FIX_FILE, "utf8"));
  assert.doesNotMatch(sql, /talent_profiles_merged_select_public/);
  assert.doesNotMatch(sql, /ON\s+(public\.)?talent_profiles\b/i);
});

test("guard: no policy created at or after version 425600 uses the global is_agency_staff() (allow-list empty)", () => {
  const bad = events()
    .filter((e) => e.version >= VERSION && e.kind === "create" && GLOBAL.test(e.body))
    .map((e) => `${e.table}.${e.name} (${e.file})`);
  assert.deepEqual(bad, [], "use is_platform_admin / is_tenant_writer / is_tenant_admin / staff_can_access_talent_profile instead");
});
