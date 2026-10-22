/**
 * TUL-1733: the platform-global surfaces (shared translation / taxonomy / location catalogs, cross-tenant
 * analytics, template promotion) must check PLATFORM admin, not the global staff role every self-serve
 * studio owner holds (and not the equally global RLS `is_agency_staff()`).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isPlatformAdmin } from "@/lib/access/platform-role";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PLATFORM_FILES = [
  "src/lib/server-actions/admin-talent-translations.ts",
  "src/lib/server-actions/admin-translations-tax-loc.ts",
  "src/lib/server-actions/admin-translation-quick-edit.ts",
  "src/app/api/admin/translations/export/route.ts",
  "src/lib/analytics/admin-talent-data.ts",
  "src/lib/dashboard/admin-dashboard-data.ts",
];

test("platform-global surfaces call requirePlatformAdmin(), never requireStaff()", () => {
  for (const f of PLATFORM_FILES) {
    const src = strip(read(f));
    assert.doesNotMatch(src, /\brequireStaff\(\)/, f);
    assert.match(src, /\brequirePlatformAdmin\(\)/, f);
  }
  const tpl = strip(read("src/lib/site-admin/edit-mode/workspace-templates-action.ts"));
  const promote = tpl.slice(tpl.indexOf("export async function promoteWorkspaceTemplate"));
  assert.match(promote.slice(0, 700), /requirePlatformAdmin\(\)/);
  assert.doesNotMatch(promote.slice(0, 900), /select\("role"\)/, "profiles has app_role, not role");
});

test("requirePlatformAdmin is session + isPlatformAdmin(profile), and requireStaff stays for non-platform callers", () => {
  const guards = strip(read("src/lib/server/action-guards.ts"));
  const body = guards.slice(guards.indexOf("export async function requirePlatformAdmin"), guards.indexOf("export async function requireAdmin"));
  assert.match(body, /await requireSession\(\)/);
  assert.match(body, /isPlatformAdmin\(session\.profile\)/);
});

test("a studio owner (agency_staff) is not a platform admin; super_admin is", () => {
  assert.equal(isPlatformAdmin({ app_role: "agency_staff" } as never), false);
  assert.equal(isPlatformAdmin({ app_role: "talent" } as never), false);
  assert.equal(isPlatformAdmin(null), false);
  assert.equal(isPlatformAdmin({ app_role: "super_admin" } as never), true);
});
