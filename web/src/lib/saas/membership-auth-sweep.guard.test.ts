import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

/**
 * Regression pins for the membership-auth sweep (2026-08-04), the fleet-wide
 * follow-on to PR #990's Card Design studio fix.
 *
 * THE BUG CLASS
 * `requireStaff()` gates the GLOBAL `profiles.app_role` (`super_admin` |
 * `agency_staff`). Workspace access, however, is MEMBERSHIP-based end to end:
 * the admin shell admits a caller via `agency.workspace.view`, and RLS gates
 * rows via `is_staff_of_tenant()` — neither consults `app_role`. The product
 * explicitly supports HYBRID WORKSPACE OWNERS: a talent/client-signup user who
 * creates or is granted a workspace keeps `app_role='talent'`/`'client'` (see
 * `workspace-lifecycle.ts`). For those tenants every `requireStaff`-gated
 * surface rendered and then failed "Not authorized." on the owner's OWN
 * workspace.
 *
 * THE FIX (the "#990 pattern")
 *   requireSession()                      — prove a session, no role claim
 *   + membership-fail-closed tenant scope — getTenantScope / getTenantScopeBySlug
 *                                           / an explicit tenantId capability check
 *   + per-capability check                — userHasCapability(cap, tenantId)
 *
 * These pins keep the converted surfaces from sliding back, and keep the
 * still-global surfaces (platform catalogs, cross-tenant analytics, dev routes)
 * to an explicit, reviewed allow-list so a NEW offender cannot land silently.
 */

/**
 * Strip comments before asserting on CALLS. The doc blocks in these files
 * legitimately name `requireStaff()` while explaining why it is wrong here, so
 * a raw source match would fail on its own explanation.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const REPO_WEB = join(__dirname, "..", "..", "..");
const ADMIN_SCOPE = readFileSync(join(__dirname, "admin-scope.ts"), "utf8");

// ── the choke point ────────────────────────────────────────────────────────

test("requireStaffTenantAction is membership-based, not global-app_role-based", () => {
  assert.doesNotMatch(
    code(ADMIN_SCOPE),
    /\brequireStaff\s*\(\)/,
    "admin-scope.ts must not call requireStaff() — it gates the GLOBAL profiles.app_role and rejects hybrid workspace owners",
  );
  assert.match(ADMIN_SCOPE, /\brequireSession\s*\(\)/);
  // Membership proof (fails closed without an agency_memberships row) …
  assert.match(ADMIN_SCOPE, /getTenantScope\(\)/);
  // … plus the capability lattice, evaluated on the RESOLVED tenant.
  assert.match(ADMIN_SCOPE, /userHasCapability\(capability, scope\.tenantId\)/);
});

test("requireStaffTenantAction's default capability is the workspace-shell baseline", () => {
  assert.match(
    ADMIN_SCOPE,
    /options\?\.capability \?\? "agency\.workspace\.view"/,
    'the default must be "agency.workspace.view" — the same gate the workspace admin shell uses to admit the caller at all',
  );
});

// ── graded surfaces ────────────────────────────────────────────────────────

const GRADED: ReadonlyArray<readonly [string, string]> = [
  // roster-card badge visibility writes agencies.settings.rosterCardBadges —
  // a card/design surface, so it grades to the Phase-5 design capability.
  ["../server-actions/admin-roster-card-badges.ts", "agency.site_admin.design.edit"],
  ["../server-actions/admin-agency-logo-upload.ts", "agency.site_admin.branding.edit"],
];

for (const [rel, cap] of GRADED) {
  test(`${rel.split("/").pop()} grades its guard up to ${cap}`, () => {
    const src = readFileSync(join(__dirname, rel), "utf8");
    assert.match(
      src,
      // P0 2026-08-07: these are workspace-admin surfaces, so they now grade
      // the WORKSPACE-scoped guard (requireWorkspaceStaffAction) — same
      // capability contract, tenant resolved from the surface not the cookie.
      new RegExp(
        `requireWorkspaceStaffAction\\(\\{\\s*\\n\\s*capability: "${cap.replace(/\./g, "\\.")}",`,
      ),
      `${rel} must pass capability: "${cap}" so the guard grades with the action instead of leaning on RLS alone`,
    );
  });
}

test("capability lattice: membership role alone decides the graded surfaces", () => {
  // This is the whole point: app_role plays no part, so a client-app_role
  // OWNER passes and an editor-role platform staffer does not.
  for (const cap of [
    "agency.site_admin.design.edit",
    "agency.site_admin.branding.edit",
  ] as const) {
    assert.equal(roleGrantsCapability("owner", cap), true, `owner holds ${cap}`);
    assert.equal(roleGrantsCapability("admin", cap), true, `admin holds ${cap}`);
    assert.equal(roleGrantsCapability("manager", cap), false, `manager must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("editor", cap), false, `editor must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("viewer", cap), false, `viewer must NOT hold ${cap}`);
  }
  // The baseline every membership role holds — what the default guard asks for.
  for (const role of ["viewer", "editor", "manager", "admin", "owner"] as const) {
    assert.equal(
      roleGrantsCapability(role, "agency.workspace.view"),
      true,
      `${role} must hold agency.workspace.view (the requireStaffTenantAction baseline)`,
    );
  }
});

// ── the allow-list ─────────────────────────────────────────────────────────

/**
 * The ONLY non-test files still allowed to call `requireStaff()`.
 *
 * Every entry is a PLATFORM-global surface with no tenant to scope to, so the
 * global `app_role` is the correct (and only available) gate. Anything
 * workspace-scoped belongs on the #990 pattern instead — adding a file here
 * needs a reviewer to agree it is genuinely cross-tenant.
 */
const REQUIRE_STAFF_ALLOW_LIST: ReadonlyArray<readonly [string, string]> = [
  ["src/lib/server/action-guards.ts", "the definition itself"],
  [
    "src/app/api/admin/translations/export/route.ts",
    "exports the shared platform translation catalog — cross-tenant by construction, no tenant to scope to",
  ],
  ["src/app/api/dev/reset-guest/route.ts", "dev-only fixture reset; not reachable in production"],
  [
    "src/lib/analytics/admin-talent-data.ts",
    "cross-tenant platform aggregates (saved_talent / talent_profiles totals), deliberately not tenant-filtered",
  ],
  [
    "src/lib/dashboard/admin-dashboard-data.ts",
    "loadAdminTranslationHealth only — global translation-bootstrap health, no tenant dimension",
  ],
  [
    "src/lib/server-actions/admin-clients.ts",
    "writes global client_profiles rows + provisions auth users; has no tenant scope to prove (own lane)",
  ],
  [
    "src/lib/server-actions/admin-talent.ts",
    "writes the global talent_profiles table with no tenant proof in the action; converting needs a roster-membership check first (own lane)",
  ],
  [
    "src/lib/server-actions/admin-talent-translations.ts",
    "global talent bio translations, same untenanted talent_profiles surface as admin-talent.ts (own lane)",
  ],
  [
    "src/lib/server-actions/admin-translation-quick-edit.ts",
    "shared platform translation catalog",
  ],
  [
    "src/lib/server-actions/admin-translations-tax-loc.ts",
    "shared platform taxonomy + location label catalogs",
  ],
  [
    "src/lib/site-admin/edit-mode/workspace-templates-action.ts",
    "promoteWorkspaceTemplate only — publishes a template to the PLATFORM library; carries its own explicit super_admin check",
  ],
];

test("no NEW surface re-introduces the global-app_role gate", () => {
  // `grep -l` over the tracked source tree; excludes tests (which legitimately
  // reference the guard by name when pinning its behavior).
  const raw = execFileSync(
    "bash",
    [
      "-c",
      `grep -rl 'requireStaff' src --include='*.ts' --include='*.tsx' | grep -v '\\.test\\.' | sort`,
    ],
    { cwd: REPO_WEB, encoding: "utf8" },
  ).trim();
  // Comment-stripped, so a file that merely EXPLAINS the guard (or names it in
  // a doc block) is not counted — only a real call is.
  const offenders = (raw ? raw.split("\n") : []).filter((f) =>
    /\brequireStaff\s*\(/.test(code(readFileSync(join(REPO_WEB, f), "utf8"))),
  );
  const allowed = new Set(REQUIRE_STAFF_ALLOW_LIST.map(([f]) => f));
  const unexpected = offenders.filter((f) => !allowed.has(f));
  assert.deepEqual(
    unexpected,
    [],
    `These files call requireStaff() but are not on the reviewed platform-global allow-list.\n` +
      `requireStaff gates the GLOBAL profiles.app_role and rejects hybrid workspace owners.\n` +
      `Use requireStaffTenantAction({ capability }) — or requireSession() + tenant scope — instead.`,
  );
  // Keep the allow-list honest: an entry that no longer calls requireStaff()
  // has been converted, so it must be removed rather than left as cover.
  const stale = [...allowed].filter((f) => !offenders.includes(f));
  assert.deepEqual(
    stale,
    [],
    "These allow-list entries no longer call requireStaff() — drop them from REQUIRE_STAFF_ALLOW_LIST",
  );
});
