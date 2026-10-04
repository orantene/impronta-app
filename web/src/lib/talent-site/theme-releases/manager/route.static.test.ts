import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(HERE, "../../../..");
const ROUTE = join(SRC, "app/(workspace)/platform/admin/builder-lab/themes");
const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("routes exist under the platform-admin Builder Lab", () => {
  assert.ok(existsSync(join(ROUTE, "page.tsx")), "themes list page");
  assert.ok(existsSync(join(ROUTE, "[releaseId]/page.tsx")), "release page");
  assert.ok(existsSync(join(ROUTE, "actions.ts")), "actions");
});

test("both pages re-check platform admin and 404 otherwise", () => {
  for (const p of [join(ROUTE, "page.tsx"), join(ROUTE, "[releaseId]/page.tsx")]) {
    const s = read(p);
    assert.match(s, /isPlatformAdmin\(session\.profile\)/);
    assert.match(s, /notFound\(\)/);
    assert.match(s, /export const dynamic = "force-dynamic"/);
  }
});

test("every server action is gated and goes through the manager (guarded channel change)", () => {
  const s = read(join(ROUTE, "actions.ts"));
  assert.match(s, /^"use server"/);
  assert.match(s, /isPlatformAdmin\(session\.profile\)/);
  assert.match(s, /changeChannel\(admin, release, target\)/);
  assert.match(s, /runDryRun\(admin, release\)/);
  // No action reaches the DB before gate(): the shared wrapper calls it first.
  assert.match(s, /const g = await gate\(\);\s*if \(!g\.ok\) return g;\s*const admin/);
});

test("channel change: the guard runs before any effect", () => {
  const s = read(join(HERE, "channel.ts"));
  const guard = s.indexOf("checkChannelChange(release, target)");
  assert.ok(guard > 0);
  assert.ok(guard < s.indexOf("deps.applyToDemos()"));
  assert.ok(guard < s.indexOf("deps.fanOut()"));
  assert.ok(guard < s.indexOf("deps.persist(target)"));
});

test("dry run is read-only; demos are is_demo profiles, never is_test_account", () => {
  const mgr = read(join(HERE, "release-manager.server.ts"));
  const merge = read(join(HERE, "merge-site.server.ts"));
  const dry = mgr.slice(mgr.indexOf("export async function runDryRun"), mgr.indexOf("async function applyToDemos"));
  assert.doesNotMatch(dry, /writeMergedDraft|publishDemoSite|\.insert\(|talent_sites"\)\s*\.update/);
  assert.match(mgr, /is_demo/);
  assert.match(mgr, /isDemo: p\.isDemo/);
  assert.match(mgr, /talentSitesOnly\(/, "notices + auto-improve skip demos");
  assert.doesNotMatch(mgr, /isDemoAccount\(/);
  const code = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s*\/\/[^\n]*/g, "");
  assert.doesNotMatch(code(mgr + merge + read(join(HERE, "notify.ts"))), /is_test_account/);
});

test("route files carry no colour literals and no em dashes", () => {
  const files = [...walk(ROUTE), ...readdirSync(HERE).filter((f) => !f.includes(".test.")).map((f) => join(HERE, f))];
  for (const f of files) {
    const s = read(f);
    assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b(?![\w-])/, `${f} has a hex literal`);
    assert.doesNotMatch(s, /—/, `${f} has an em dash`);
  }
});

test("solo-talent bell rows use a null tenant on the talent surface (no migration needed)", () => {
  const s = read(join(HERE, "notify.ts"));
  assert.match(s, /tenant_id: null/);
  assert.match(s, /surface: "talent"/);
});

test("release admin migration: admin-only columns, no anon", () => {
  const sql = read(join(SRC, "../../supabase/migrations/20261231299560_theme_release_admin_columns.sql")).replace(/--[^\n]*/g, "");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS base_payload jsonb/);
  assert.match(sql, /REVOKE SELECT ON public\.talent_theme_releases FROM authenticated/);
  const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
  assert.doesNotMatch(grant, /base_payload|dry_run_report/);
  assert.doesNotMatch(sql, /anon/i);
});
