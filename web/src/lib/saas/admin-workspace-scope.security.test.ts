/**
 * P0 regression (2026-08-07) — workspace-admin server actions must resolve
 * their tenant from the WORKSPACE SURFACE in the request (URL slug / branded
 * host), never from the operator's preferred-tenant cookie or default
 * membership.
 *
 * THE DEFECT THESE PIN
 * `requireStaffTenantAction` resolved via `getTenantScope()`:
 *   header -> impronta.active_tenant_id cookie -> first active membership.
 * On the shared app host the header is absent, so a multi-workspace operator
 * standing on `/nova-crew/admin/settings` with a cookie preferring `impronta`
 * had the Brand identity drawer LOAD impronta's saved logo and SAVE the new
 * upload onto impronta's `agencies.settings.branding` + `agency_branding`
 * rows — silent cross-workspace corruption. Live-reproduced on prod data.
 *
 * Mirrors edit-surface-scope.security.test.ts (PR #1031), the storefront-edit
 * sibling of the same bug class.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  extractAdminWorkspaceSlug,
  pickWorkspaceMembership,
  getAdminWorkspaceScope,
} from "./admin-workspace-scope";
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

// The live shape that exposed this: qa-admin is a member of BOTH impronta and
// nova-crew; `impronta` is what the cookie preferred / pickDefault() returns.
const IMPRONTA = "00000000-0000-0000-0000-000000000001";
const NOVA_CREW = "33333333-3333-3333-3333-333333333333";
const MULTI_WORKSPACE: TenantMembership[] = [
  membership(IMPRONTA, "impronta"),
  membership(NOVA_CREW, "nova-crew"),
];

// ── slug extraction (the surface derivation) ────────────────────────────────

test("extractAdminWorkspaceSlug: canonical /{slug}/admin/* paths name the workspace", () => {
  assert.equal(extractAdminWorkspaceSlug("/nova-crew/admin/settings"), "nova-crew");
  assert.equal(extractAdminWorkspaceSlug("/nova-crew/admin"), "nova-crew");
  assert.equal(extractAdminWorkspaceSlug("/impronta/admin/messages/abc"), "impronta");
});

test("extractAdminWorkspaceSlug: path-addressed /w/{slug}/admin/* names the workspace", () => {
  assert.equal(extractAdminWorkspaceSlug("/w/nova-crew/admin/settings"), "nova-crew");
});

test("extractAdminWorkspaceSlug: non-admin and slug-less surfaces yield nothing", () => {
  // Branded host — slug-less; the HOST names the workspace instead.
  assert.equal(extractAdminWorkspaceSlug("/admin/settings"), null);
  // Talent surface under a slug is NOT an admin workspace surface.
  assert.equal(extractAdminWorkspaceSlug("/nova-crew/talent/inbox/1"), null);
  // API route prefixes are not tenant slugs.
  assert.equal(extractAdminWorkspaceSlug("/api/admin/roster-import"), null);
  // Storefront paths.
  assert.equal(extractAdminWorkspaceSlug("/nova-crew/gallery"), null);
  assert.equal(extractAdminWorkspaceSlug("/"), null);
  assert.equal(extractAdminWorkspaceSlug(""), null);
});

// ── membership binding (fail closed, never downgrade) ───────────────────────

test("REPRO: member-of-A-and-B + cookie-prefers-A + action-invoked-from-B's-admin resolves B, never A", () => {
  // The cookie preference plays NO part: the surface slug is the only input.
  const surfaceSlug = extractAdminWorkspaceSlug("/nova-crew/admin/settings");
  assert.equal(surfaceSlug, "nova-crew");
  const picked = pickWorkspaceMembership(MULTI_WORKSPACE, { slug: surfaceSlug! });
  assert.equal(picked?.tenant_id, NOVA_CREW);
  // The pre-fix behaviour was MULTI_WORKSPACE[0] (impronta, the cookie/default).
  assert.notEqual(picked?.tenant_id, IMPRONTA);
});

test("a non-member on a workspace admin surface fails closed instead of downgrading", () => {
  const picked = pickWorkspaceMembership(MULTI_WORKSPACE, { slug: "someone-elses-agency" });
  assert.equal(picked, null, "must NOT fall back to the caller's default workspace");
});

test("branded-host binding matches by the host's verified tenant id", () => {
  const picked = pickWorkspaceMembership(MULTI_WORKSPACE, { tenantId: NOVA_CREW });
  assert.equal(picked?.slug, "nova-crew");
  assert.equal(pickWorkspaceMembership(MULTI_WORKSPACE, { tenantId: "44444444-4444-4444-4444-444444444444" }), null);
});

test("membership order never decides the answer", () => {
  const reversed = [...MULTI_WORKSPACE].reverse();
  const a = pickWorkspaceMembership(MULTI_WORKSPACE, { slug: "nova-crew" });
  const b = pickWorkspaceMembership(reversed, { slug: "nova-crew" });
  assert.equal(a?.tenant_id, b?.tenant_id);
  assert.equal(a?.tenant_id, NOVA_CREW);
});

test("an empty membership list resolves nothing", () => {
  assert.equal(pickWorkspaceMembership([], { slug: "nova-crew" }), null);
  assert.equal(pickWorkspaceMembership([], { tenantId: NOVA_CREW }), null);
});

/**
 * STRUCTURAL ANTI-ESCALATION PROPERTY.
 *
 * The scope resolver takes NO arguments, and the action guard's only
 * parameter is a capability to grade UP with. A server action therefore
 * cannot be talked into another tenant by its payload — the only inputs are
 * request headers `proxy.ts` writes after sanitising all inbound
 * `x-impronta-*` headers, plus the actor's own membership rows.
 */
test("workspace scope resolver and guard accept no tenant input from the caller", () => {
  assert.equal(typeof getAdminWorkspaceScope, "function");

  const scopeSrc = readFileSync(join(SRC, "lib/saas/admin-workspace-scope.ts"), "utf8");
  // The cached resolver's inner arrow must be nullary.
  assert.match(scopeSrc, /getAdminWorkspaceScope = cache\(\s*\n?\s*async \(\):/);

  const guardSrc = readFileSync(join(SRC, "lib/saas/admin-scope.ts"), "utf8");
  assert.match(
    guardSrc,
    /requireWorkspaceStaffAction\(options\?: \{\s*\n\s*capability\?: CapabilityKey;\s*\n\s*\}\)/,
    "the ONLY caller-supplied input is a capability",
  );
  const sig = guardSrc.slice(
    guardSrc.indexOf("export async function requireWorkspaceStaffAction"),
    guardSrc.indexOf("getAdminWorkspaceScope(),"),
  );
  assert.ok(sig.length > 0, "signature located");
  assert.doesNotMatch(
    sig,
    /tenantId|tenantSlug|tenant_id/,
    "structural anti-escalation: no tenant identifier may enter through the signature",
  );
});

test("fail-closed: a surface non-member is logged and refused, never downgraded", () => {
  const scopeSrc = readFileSync(join(SRC, "lib/saas/admin-workspace-scope.ts"), "utf8");
  assert.match(scopeSrc, /security\.admin_workspace_scope_non_member/);
  // The fail-closed branch returns null — it must not re-enter getTenantScope.
  const failBranch = scopeSrc.slice(
    scopeSrc.indexOf("async function resolveMembershipOrFailClosed"),
  );
  assert.doesNotMatch(failBranch, /getTenantScope\(\)/, "no cookie/default fallback after a surface was derived");
});

/**
 * The fix is only worth anything if the workspace-admin actions actually use
 * it. "Fix the whole class" guard: no server action under the workspace-admin
 * action trees may go back to the cookie/default-based guard. The two
 * edit-mode callers stay on `requireStaffTenantAction` by design (PR #1031
 * already surface-scopes the builder lane; see kept-list in the PR).
 */
test("workspace-admin action files do not call requireStaffTenantAction()", () => {
  const dirs = [
    "lib/server-actions",
    "app/(workspace)/[tenantSlug]/admin",
    "app/api/admin",
    "lib/call-sheet",
    "lib/talent-calendar",
    "lib/site-admin/collections",
    "lib/reviews",
  ];
  const offenders: string[] = [];
  for (const dir of dirs) {
    for (const file of listTsFiles(join(SRC, dir))) {
      if (/\.test\.tsx?$/.test(file)) continue;
      const body = readFileSync(file, "utf8");
      // Match calls, not prose in comments referencing history.
      if (/\brequireStaffTenantAction\s*\(/.test(stripComments(body))) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `workspace-admin actions must call requireWorkspaceStaffAction(): ${offenders.join(", ")}`,
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
