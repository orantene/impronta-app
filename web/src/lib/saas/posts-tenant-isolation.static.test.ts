/**
 * posts-tenant-isolation.static.test.ts — the Posts write path checked for
 * tenant scoping, from source (W3).
 *
 * WHY A SOURCE SCAN
 * ─────────────────
 * The Posts server actions run with the caller's session client, so RLS
 * (`is_agency_staff()`) is role-blind and TENANT-blind for staff: an admin
 * of agency A holding agency B's post id must still never touch it. The
 * application layer's `tenantScopedQuery` is what enforces that, and the
 * `ratchet/no-untenanted-from` lint only covers `src/lib/server-actions/**`
 * — the lib layer (`lib/site-admin/server/posts.ts`), where every query
 * actually lives, is outside the lint's file glob. This test closes that
 * gap the way `admin-href-invariant.static.test.ts` closes its own: assert
 * what the source SAYS.
 *
 * WHAT IS ASSERTED
 * ────────────────
 *   1. No raw `.from("cms_posts")` in either file — every cms_posts
 *      read/write goes through `tenantScopedQuery(…, tenantId)`.
 *   2. The ONE sanctioned raw `.from(...)` is the `cms_post_revisions`
 *      insert: that table has no tenant_id column, so it cannot be scoped —
 *      its isolation is the post row it references, which assertion 1
 *      proves was always fetched tenant-scoped. Exactly one call site, and
 *      it must be an insert.
 *   3. Every exported operation in the lib layer opens with a
 *      `requirePhase5Capability` check (the same pages.edit / pages.publish
 *      caps the Pages surface uses).
 *
 * LANE — `npm run test:tenant-isolation` (registered in package.json; a
 * test in no lane never runs).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `web/src` — derived from this file, never from cwd. */
const SRC_ROOT = resolve(HERE, "..", "..");

const LIB_LAYER = readFileSync(join(SRC_ROOT, "lib/site-admin/server/posts.ts"), "utf8");
const ACTIONS = readFileSync(join(SRC_ROOT, "lib/server-actions/admin-site-posts.ts"), "utf8");

test("no raw .from(\"cms_posts\") anywhere in the posts write path", () => {
  for (const [name, source] of [
    ["lib/site-admin/server/posts.ts", LIB_LAYER],
    ["lib/server-actions/admin-site-posts.ts", ACTIONS],
  ] as const) {
    assert.ok(
      !/\.from\(\s*["'`]cms_posts["'`]/.test(source),
      `${name} reaches cms_posts without tenantScopedQuery — a missed tenant filter is a cross-tenant write`,
    );
  }
});

test("every cms_posts query in the lib layer routes through tenantScopedQuery with the tenantId", () => {
  const calls = [...LIB_LAYER.matchAll(/tenantScopedQuery\(\s*supabase,\s*"cms_posts",\s*([A-Za-z.]+)\s*\)/g)];
  // Liveness: a refactor that renames the helper would otherwise make this
  // file pass by matching nothing.
  assert.ok(calls.length >= 6, `expected >= 6 tenantScopedQuery cms_posts call sites, saw ${calls.length}`);
  for (const call of calls) {
    assert.equal(
      call[1],
      "params.tenantId",
      `tenantScopedQuery must be scoped by params.tenantId, saw "${call[1]}"`,
    );
  }
});

test("the only raw .from() is the cms_post_revisions insert (no tenant_id column to scope)", () => {
  const rawFroms = [...LIB_LAYER.matchAll(/\bsupabase\s*\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    rawFroms,
    ["cms_post_revisions"],
    "any second raw .from() call must justify itself here or use tenantScopedQuery",
  );
  assert.ok(
    /\.from\("cms_post_revisions"\)\.insert\(/.test(LIB_LAYER),
    "the revisions call must be an insert — reads of another tenant's snapshots would leak content",
  );
});

test("every exported lib-layer operation gates on requirePhase5Capability", () => {
  const exported = [...LIB_LAYER.matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]!);
  assert.ok(
    exported.length >= 6,
    `expected the 6 post operations to be exported, saw ${exported.length}`,
  );
  const capabilityChecks = [...LIB_LAYER.matchAll(/await requirePhase5Capability\(\s*"agency\.site_admin\.pages\.(edit|publish)"/g)];
  assert.ok(
    capabilityChecks.length >= exported.length,
    `every exported operation must open with a capability check: ${exported.length} exports, ${capabilityChecks.length} checks`,
  );
});

test("the server actions resolve the tenant from the session scope, never from client input", () => {
  // requireTenantScope() is the only tenant source; no action parameter may
  // carry a tenantId the server would trust.
  assert.ok(/requireTenantScope\(\)/.test(ACTIONS), "actions must call requireTenantScope()");
  // The guard's own session-derived tenantId is the ONLY one that reaches the
  // lib layer; nothing may read a tenant off client input.
  assert.ok(
    !/input\.tenantId/.test(ACTIONS),
    "no action may read tenantId from its input — the session scope is the only tenant source",
  );
  const libCalls = [...ACTIONS.matchAll(/tenantId:\s*([A-Za-z.]+),/g)].map((m) => m[1]);
  assert.ok(libCalls.length >= 6, `expected each action to pass a tenantId, saw ${libCalls.length}`);
  for (const source of libCalls) {
    assert.equal(source, "g.tenantId", `lib-layer tenantId must come from the guard, saw "${source}"`);
  }
});
