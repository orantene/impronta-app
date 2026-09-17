import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `_events-page-actions.ts` follows the `_events-actions.ts` guard pattern to
 * the letter. THE TENANT IS NEVER A PARAMETER: the workspace comes from the
 * session and the surface under the operator's cursor, every read is scoped
 * to it, the write is capability-gated, and a page id from another workspace
 * is refused before anything is written. Pinned at the source, because a
 * `loadX(tenantId)` would typecheck, read naturally and pass review.
 */

const FILE = "src/app/(workspace)/[tenantSlug]/admin/_events-page-actions.ts";
const src = readFileSync(join(process.cwd(), FILE), "utf8");
const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const exportedActions = [...body.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]!);

test("the file is a server-action module with exactly the two actions the tab uses", () => {
  assert.match(src, /^"use server";/);
  assert.deepEqual(exportedActions.sort(), ["loadEventPageLink", "setEventPage"]);
});

test("no tenant identifier enters through any signature", () => {
  for (const name of exportedActions) {
    const sig = body.match(new RegExp(`export async function ${name}\\(([^)]*)\\)`))![1]!;
    assert.doesNotMatch(sig, /tenant/i, `${name}: ${sig}`);
  }
  assert.doesNotMatch(body, /tenantId:\s*z\./, "no schema accepts a tenant id");
});

test("every action calls requireWorkspaceStaffAction first, never requireStaffTenantAction", () => {
  assert.doesNotMatch(body, /requireStaffTenantAction/);
  for (const name of exportedActions) {
    const start = body.indexOf(`export async function ${name}(`);
    const next = exportedActions.map((n) => body.indexOf(`export async function ${n}(`)).filter((i) => i > start).sort((a, b) => a - b)[0] ?? body.length;
    const fn = body.slice(start, next);
    const guardAt = fn.indexOf("await requireWorkspaceStaffAction(");
    assert.ok(guardAt > 0, `${name} calls the guard`);
    const firstRead = Math.min(...[".from(", ".rpc("].map((s) => fn.indexOf(s)).filter((i) => i > 0));
    assert.ok(guardAt < firstRead, `${name}: the guard runs before the first read`);
    assert.match(fn, /if \(!guard\.ok\) return \{ ok: false, error: guard\.error \};/, `${name} fails closed`);
  }
});

test("the write is capability-gated, checks the page inside this workspace, and scopes the update by tenant", () => {
  const start = body.indexOf("export async function setEventPage(");
  const fn = body.slice(start);
  assert.match(fn, /requireWorkspaceStaffAction\(\{ capability: CAPABILITY \}\)/);
  assert.match(body, /const CAPABILITY = "manage_agency_settings" as const;/);
  // The page existence check: same tenant, published, not system-owned.
  assert.match(fn, /\.from\("cms_pages"\)[\s\S]*?\.eq\("tenant_id", guard\.tenantId\)[\s\S]*?\.eq\("id", parsed\.data\.pageId\)[\s\S]*?\.eq\("status", "published"\)[\s\S]*?\.eq\("is_system_owned", false\)/);
  assert.match(fn, /if \(!page\) return \{ ok: false, error: "That page is not a published page of this workspace\." \};/);
  // The update itself is tenant-scoped and reports a miss instead of silently succeeding.
  assert.match(fn, /\.update\(\{ page_id: parsed\.data\.pageId,[\s\S]*?\.eq\("tenant_id", guard\.tenantId\)\s*\.eq\("id", parsed\.data\.eventId\)\s*\.select\("id"\)/);
  assert.match(fn, /if \(!data \|\| data\.length === 0\) return \{ ok: false/);
  // Null is a legal value: it clears the link and the engine page renders again.
  assert.match(body, /pageId: z\.string\(\)\.uuid\(\)\.nullable\(\)/);
});

test("the read lists published, non-system pages of this workspace only", () => {
  const start = body.indexOf("export async function loadEventPageLink(");
  const end = body.indexOf("export async function setEventPage(");
  const fn = body.slice(start, end);
  assert.match(fn, /\.from\("events"\)[^;]*\.eq\("tenant_id", tenantId\)\.eq\("id", parsed\.data\.eventId\)/);
  assert.match(fn, /\.from\("cms_pages"\)[\s\S]*?\.eq\("tenant_id", tenantId\)[\s\S]*?\.eq\("status", "published"\)[\s\S]*?\.eq\("is_system_owned", false\)/);
});
