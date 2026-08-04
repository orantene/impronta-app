import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { rolePhase5HasCapability } from "../capabilities";

/**
 * Regression pin for the Card Design studio "hangs on every workspace except
 * impronta" incident (2026-08-04).
 *
 * Root cause: `loadDesignAction` / `readCardDesignFieldCandidates` (and every
 * sibling action in design-actions.ts / directory-catalogs.ts) guarded with
 * `requireStaff()`, which requires the GLOBAL `profiles.app_role` to be
 * `super_admin` | `agency_staff`. But workspace access itself is
 * MEMBERSHIP-based (`agency.workspace.view` via agency_memberships), and the
 * product explicitly supports hybrid owners — a talent/client-signup user who
 * owns a workspace keeps `app_role='talent'`/`'client'` (documented in
 * workspace-lifecycle.ts). For those tenants the studio page rendered, but
 * every server action returned "Not authorized.", leaving the design loader
 * and the engine-fields loader dead.
 *
 * The fix: those actions authorize with `requireSession()` + tenant-scope
 * resolution (which fails closed without an agency_memberships row) + the
 * membership-role capability lattice. These pins keep the guard from
 * regressing back to the global-role gate.
 */

const EDIT_MODE_DIR = __dirname;
const DESIGN_ACTIONS = readFileSync(
  join(EDIT_MODE_DIR, "design-actions.ts"),
  "utf8",
);
const DIRECTORY_CATALOGS = readFileSync(
  join(EDIT_MODE_DIR, "..", "server", "directory-catalogs.ts"),
  "utf8",
);

test("design-actions: no action re-introduces the global-app_role requireStaff gate", () => {
  // The word may legitimately appear inside comments/identifiers like
  // `loadDesignForStaff`; what must never come back is a call to the
  // `requireStaff()` guard or its import.
  assert.doesNotMatch(
    DESIGN_ACTIONS,
    /\brequireStaff\s*\(/,
    "design-actions.ts must not call requireStaff() — hybrid (talent/client app_role) workspace owners are legitimate members; guard with requireSession + tenant scope instead",
  );
  assert.match(
    DESIGN_ACTIONS,
    /\brequireSession\s*\(\)/,
    "design-actions.ts must guard with requireSession() before resolving tenant scope",
  );
  // Membership proof: every action resolves scope via the slug/cookie helpers
  // that fail closed without an agency_memberships row.
  assert.match(DESIGN_ACTIONS, /getTenantScopeBySlug/);
});

test("directory-catalogs: catalog guard is membership-based, not global-role-based", () => {
  assert.doesNotMatch(
    DIRECTORY_CATALOGS,
    /\brequireStaff\s*\(/,
    "directory-catalogs.ts must not call requireStaff() — see design-actions pin",
  );
  assert.match(DIRECTORY_CATALOGS, /\brequireSession\s*\(\)/);
});

test("directory-catalogs: GLOBAL System-B flag writes stay capability-gated", () => {
  // The two writers that mutate profile_field_definitions.show_in_directory_*
  // (global, cross-tenant effect) must require the admin/owner-grade
  // membership capability now that the global-role gate is gone.
  const writers = ["setFieldCardVisible", "setFieldDirectoryFilterVisible"];
  for (const writer of writers) {
    const idx = DIRECTORY_CATALOGS.indexOf(`export async function ${writer}`);
    assert.ok(idx >= 0, `${writer} must exist`);
    const body = DIRECTORY_CATALOGS.slice(idx, idx + 600);
    assert.match(
      body,
      /requireCapability:\s*"agency\.site_admin\.design\.edit"/,
      `${writer} must pass requireCapability: "agency.site_admin.design.edit" to guardCatalogScope`,
    );
  }
});

test("capability lattice: membership role alone (no app_role) decides design.edit", () => {
  // The lattice the actions now rely on: owner/admin memberships hold
  // design.edit; manager/editor/viewer do not. app_role plays no part here —
  // that is exactly why a client-app_role OWNER must pass the action guards.
  assert.equal(rolePhase5HasCapability("owner", "agency.site_admin.design.edit"), true);
  assert.equal(rolePhase5HasCapability("admin", "agency.site_admin.design.edit"), true);
  assert.equal(rolePhase5HasCapability("manager", "agency.site_admin.design.edit"), false);
  assert.equal(rolePhase5HasCapability("editor", "agency.site_admin.design.edit"), false);
  assert.equal(rolePhase5HasCapability("viewer", "agency.site_admin.design.edit"), false);
});
