import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { OWNER_HUB_COPY } from "./owner-hub-copy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the actions are guarded server actions: not under impersonation, staff only, schema-validated", () => {
  const src = read("src/lib/server-actions/service-hub-entries.ts");
  assert.match(src, /^"use server";/);
  assert.equal((src.match(/await requireNotImpersonating\(\)/g) ?? []).length, 5);
  assert.match(src, /requireWorkspaceStaffAction\(\)/);
  assert.doesNotMatch(src, /\.from\(/);
});

test("the server module scopes every tenant table through tenantScopedQuery and re-checks the role before each write", () => {
  const src = read("src/lib/service-hub/entries.server.ts");
  for (const t of ["agency_memberships", "workspace_service_entries", "workspace_service_listings"]) {
    const raw = new RegExp(`admin\\s*\\.from\\("${t}"\\)|ctx\\.admin\\s*\\.from\\("${t}"\\)`);
    assert.doesNotMatch(src, raw, t);
  }
  assert.equal((src.match(/await guard\(ctx,/g) ?? []).length, 4);
  assert.match(src, /resolveHubRoles\(ctx\.admin/);
});

test("held migration 420400 raises when the listings table is missing, writes only via the service role, and has rollback", () => {
  const sql = read("../supabase/migrations/_pending_pm/20261231420400_workspace_service_entries_tul1369.sql");
  const body = sql.replace(/--.*$/gm, "");
  assert.match(body, /to_regclass\('public\.workspace_service_listings'\) IS NULL/);
  assert.match(body, /ADD COLUMN IF NOT EXISTS entry_id/);
  assert.match(body, /ADD COLUMN IF NOT EXISTS owner_skipped_at/);
  assert.doesNotMatch(body, /FOR (INSERT|UPDATE|DELETE|ALL)/i);
  assert.doesNotMatch(body, /DROP TABLE|DELETE FROM|^\s*UPDATE\b/im);
  assert.match(sql, /-- Rollback[\s\S]*DROP TABLE IF EXISTS public\.workspace_service_entries/);
});

test("the page is a standalone canonical route behind the staff guard", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/admin/catalog/service-hub/page.tsx");
  assert.match(page, /if \(!guard\.ok\) notFound\(\)/);
  assert.match(page, /OwnerHubScreen/);
});

test("copy: ES and EN carry the same keys, none empty, no em dashes", () => {
  assert.deepEqual(Object.keys(OWNER_HUB_COPY.en).sort(), Object.keys(OWNER_HUB_COPY.es).sort());
  for (const l of ["en", "es"] as const) for (const v of Object.values(OWNER_HUB_COPY[l])) assert.ok(v.length > 0 && !v.includes("—"));
});
