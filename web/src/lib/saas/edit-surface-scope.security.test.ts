/**
 * P1 regression (2026-08-07) — editor tenant scope must come from the SURFACE
 * being edited, never from the caller and never from the operator's
 * cookie/default workspace.
 *
 * The defect these pin: `requireTenantScope()` resolves
 *   header -> impronta.active_tenant_id cookie -> first active membership.
 * Only the header describes the storefront under the operator's cursor. A
 * multi-workspace operator (the live QA account has SIX active memberships)
 * therefore gets a different tenant the moment the header is absent — best
 * case a "Select an agency workspace" refusal, worst case another of their
 * own tenants' rows.
 *
 * Kept in `src/lib/saas/**` on purpose: a test that lives in
 * `lib/site-admin/**` and reaches into `edit-chrome` violates the frozen
 * lib -> edit-chrome cycle guard that runs in `test:builder` (the mistake
 * wave 0 made). Nothing here imports edit-chrome.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  pickEditSurfaceMembership,
  getEditSurfaceTenantId,
  getEditSurfaceTenantScope,
  requireEditSurfaceTenantScope,
} from "./edit-surface-scope";
import type { TenantMembership } from "./tenant";

const SRC = join(process.cwd(), "src");

function membership(tenantId: string, slug: string): TenantMembership {
  return {
    tenant_id: tenantId,
    role: "admin",
    status: "active",
    slug,
    display_name: slug,
    agency_status: "active",
  };
}

// The live shape of the QA account that exposed this: `impronta` sorts first,
// so it is what `pickDefault()` in scope.ts would hand back, while the
// operator is standing on `qa-agency-244988`.
const MULTI_WORKSPACE: TenantMembership[] = [
  membership("00000000-0000-0000-0000-000000000001", "impronta"),
  membership("22222222-2222-2222-2222-222222222222", "qa-agency"),
  membership("f1e6980c-f064-4172-befb-02cc7b1e0039", "qa-agency-244988"),
];

test("scope comes from the surface, not from the operator's default workspace", () => {
  const picked = pickEditSurfaceMembership(
    "f1e6980c-f064-4172-befb-02cc7b1e0039",
    MULTI_WORKSPACE,
  );
  assert.equal(picked?.slug, "qa-agency-244988");
  // The pre-fix behaviour would have been MULTI_WORKSPACE[0] (`impronta`).
  assert.notEqual(picked?.tenant_id, MULTI_WORKSPACE[0].tenant_id);
});

test("a non-member on a storefront fails closed instead of downgrading", () => {
  // nova-crew: a real seeded tenant this operator is NOT a member of. The old
  // chain would have fallen through to their default workspace and let the
  // action operate on THAT tenant's rows.
  const picked = pickEditSurfaceMembership(
    "33333333-3333-3333-3333-333333333333",
    MULTI_WORKSPACE,
  );
  assert.equal(picked, null);
});

test("membership order never decides the answer", () => {
  const reversed = [...MULTI_WORKSPACE].reverse();
  const a = pickEditSurfaceMembership("22222222-2222-2222-2222-222222222222", MULTI_WORKSPACE);
  const b = pickEditSurfaceMembership("22222222-2222-2222-2222-222222222222", reversed);
  assert.equal(a?.tenant_id, b?.tenant_id);
  assert.equal(a?.slug, "qa-agency");
});

test("an empty membership list resolves nothing", () => {
  assert.equal(pickEditSurfaceMembership("f1e6980c-f064-4172-befb-02cc7b1e0039", []), null);
});

/**
 * STRUCTURAL ANTI-ESCALATION PROPERTY.
 *
 * The resolvers take NO arguments. A server action therefore cannot be talked
 * into another tenant by its payload — the only inputs are request headers
 * that `proxy.ts` writes from a verified `agency_domains` lookup, plus the
 * actor's own membership rows. If someone ever adds a `tenantId` parameter
 * here, this fails.
 */
test("editor scope resolvers accept no caller input", () => {
  assert.equal(getEditSurfaceTenantId.length, 0);
  assert.equal(requireEditSurfaceTenantScope.length, 0);
  // `cache()` wraps the function, so assert on the source instead.
  assert.equal(typeof getEditSurfaceTenantScope, "function");

  const source = readFileSync(join(SRC, "lib/saas/edit-surface-scope.ts"), "utf8");
  assert.match(source, /async function getEditSurfaceTenantId\(\)/);
  assert.match(source, /async function requireEditSurfaceTenantScope\(\)/);
  // The cached resolver's inner arrow must be nullary too.
  assert.match(source, /getEditSurfaceTenantScope = cache\(\s*async \(\):/);
});

/**
 * The fix is only worth anything if the editor actions actually use it. This
 * is the "fix the whole class" guard: no server action under
 * `lib/site-admin/edit-mode/**` or the builder-core adapters may go back to
 * the cookie/default-based `requireTenantScope()`.
 */
test("no editor server action resolves scope via requireTenantScope()", () => {
  const dirs = [
    "lib/site-admin/edit-mode",
    "lib/site-admin/builder-core/adapters",
    "lib/site-admin/builder-core/ai",
  ];
  const offenders: string[] = [];
  for (const dir of dirs) {
    const files = listTsFiles(join(SRC, dir));
    for (const file of files) {
      if (/\.test\.tsx?$/.test(file)) continue;
      const body = readFileSync(file, "utf8");
      // Match calls, not prose in comments referencing history.
      if (/\brequireTenantScope\s*\(/.test(stripComments(body))) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `editor actions must call requireEditSurfaceTenantScope(): ${offenders.join(", ")}`,
  );
});

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Crude but sufficient: drop block and line comments before pattern-matching. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
