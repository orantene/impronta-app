import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { rolePhase5HasCapability } from "../capabilities";

/**
 * Capability-grade pins for the builder's DIRECT-WRITE mutations
 * (2026-08-04, follow-up to PR #995).
 *
 * #990 and #995 fixed the right bug: `requireStaff()` gated the GLOBAL
 * `profiles.app_role`, which locked hybrid workspace owners out of their own
 * workspace, and the sweep replaced it with `requireSession()` + a
 * membership-fail-closed tenant scope. But for the subset of builder actions
 * that write DIRECTLY — via `createServiceRoleClient()` (no RLS at all), or via
 * the user client where RLS is only `is_staff_of_tenant()` (any active
 * membership, role-blind) — the removed global gate was, by accident, the only
 * thing separating a `viewer`-role member from a live-site write. Those actions
 * do NOT delegate to a `lib/site-admin/server/*` op, so they inherit no
 * `requirePhase5Capability` from underneath either.
 *
 * The contract pinned here: every one of those mutations checks an explicit
 * `agency.site_admin.pages.{edit,publish}` capability, and checks it against
 * the SERVER-RESOLVED `scope.tenantId` — never a tenant id taken from action
 * input, which would turn the check into a no-op a caller could aim anywhere.
 *
 * Reads are deliberately NOT pinned here: membership alone is the right gate
 * for them, matching #995.
 */

const EDIT_MODE = __dirname;
const SITE_ADMIN = join(EDIT_MODE, "..");

const EDIT = "agency.site_admin.pages.edit";
const PUBLISH = "agency.site_admin.pages.publish";

/**
 * file → [exported action, required capability]. Every entry writes directly
 * (service-role and/or role-blind RLS) rather than through a capability-checked
 * `server/*` op.
 */
const DIRECT_WRITE_ACTIONS: ReadonlyArray<
  readonly [file: string, action: string, capability: string]
> = [
  // Service-role writes — zero RLS backstop.
  ["cms-seo-actions.ts", "savePageSlugAction", EDIT],
  ["cms-seo-actions.ts", "savePageSeoFlagsAction", EDIT],
  ["cms-seo-actions.ts", "createRedirectAction", EDIT],
  ["cms-seo-actions.ts", "setRedirectActiveAction", EDIT],
  ["cms-seo-actions.ts", "deleteRedirectAction", EDIT],
  ["edit-mode/page-composer-action.ts", "publishPageSnapshot", PUBLISH],
  ["builder-core/adapters/site-shell-actions.ts", "publishSiteShellRow", PUBLISH],
  ["builder-core/adapters/site-shell-actions.ts", "restoreSiteShellRevisionAction", EDIT],
  // User-client writes — RLS is `is_staff_of_tenant()`, which is role-blind.
  ["builder-core/adapters/site-shell-actions.ts", "saveSiteShellRow", EDIT],
  ["builder-core/adapters/cms-page-actions.ts", "saveCmsFreeformPage", EDIT],
  ["builder-core/adapters/cms-page-actions.ts", "publishCmsFreeformPage", PUBLISH],
  ["builder-core/adapters/cms-page-actions.ts", "restoreCmsFreeformRevisionAction", EDIT],
];

const sourceCache = new Map<string, string>();
function read(rel: string): string {
  const cached = sourceCache.get(rel);
  if (cached) return cached;
  const src = readFileSync(join(SITE_ADMIN, rel), "utf8");
  sourceCache.set(rel, src);
  return src;
}

/** Source of one exported action, from its `export async function` to the next. */
function actionBody(src: string, action: string): string {
  const start = src.indexOf(`export async function ${action}(`);
  assert.ok(start >= 0, `${action} must exist`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

for (const [file, action, capability] of DIRECT_WRITE_ACTIONS) {
  test(`${file}: ${action} requires ${capability} on the resolved tenant`, () => {
    const body = actionBody(read(file), action);
    assert.match(
      body,
      new RegExp(
        `userHasCapability\\(\\s*"${capability.replace(/\./g, "\\.")}",\\s*scope\\.tenantId,?\\s*\\)`,
      ),
      `${action} writes directly (service-role, or RLS that only proves membership), so it must assert ` +
        `${capability} against the server-resolved scope.tenantId. Without it any active member — ` +
        `including a viewer — can perform this write.`,
    );
  });

  test(`${file}: ${action} does not take the tenant from caller input`, () => {
    const body = actionBody(read(file), action);
    // The capability check is only meaningful if the tenant it names is
    // server-derived. A `input.tenantId` / `params.tenantId` read inside these
    // actions would mean the caller picks the tenant being authorised.
    assert.doesNotMatch(
      body,
      /\b(?:input|params|args)\s*(?:\.|\?\.)\s*tenantId\b/,
      `${action} must derive the tenant from requireTenantScope()/getTenantScope(), never from action input`,
    );
  });
}

test("edit mode: entering agrees with the capability that renders the Edit pill", () => {
  // EditChromeMount (PR #995) renders the pill only for a member holding
  // `agency.site_admin.pages.edit` on the host's tenant. If enterEditModeAction
  // asked for less, a member who sees no pill could still POST the action and
  // mint a preview JWT over the tenant's unpublished drafts.
  const body = actionBody(
    readFileSync(join(EDIT_MODE, "server.ts"), "utf8"),
    "enterEditModeAction",
  );
  assert.match(
    body,
    /userHasCapability\(\s*"agency\.site_admin\.pages\.edit",\s*scope\.tenantId,?\s*\)/,
    "enterEditModeAction must gate on the same capability EditChromeMount uses, against the resolved scope.tenantId",
  );
});

test("cms collections: mutations grade up from the guard's default view capability", () => {
  const src = readFileSync(join(SITE_ADMIN, "collections", "actions.ts"), "utf8");
  const mutations = [
    "createCollectionAction",
    "updateCollectionAction",
    "deleteCollectionAction",
    "addCollectionItemAction",
    "updateCollectionItemAction",
    "deleteCollectionItemAction",
    "reorderCollectionItemsAction",
  ];
  for (const action of mutations) {
    const body = actionBody(src, action);
    assert.match(
      body,
      // P0 2026-08-07: collections actions moved to the WORKSPACE-scoped guard
      // (tenant from the admin surface / branded host, not the operator's
      // cookie) — same capability contract.
      /requireWorkspaceStaffAction\(\{\s*capability:\s*"agency\.site_admin\.pages\.edit",?\s*\}\)/,
      `${action} must pass capability: "agency.site_admin.pages.edit" — the guard's default ` +
        `"agency.workspace.view" is held by viewer, which must not be able to write collections`,
    );
  }
  // The two reads intentionally stay on the default (membership) capability.
  for (const action of ["listCollectionsAction", "getCollectionAction"]) {
    assert.match(
      actionBody(src, action),
      /requireWorkspaceStaffAction\(\)/,
      `${action} is a read — it should stay on the guard's default view capability`,
    );
  }
});

test("capability lattice: the grade actually excludes viewer, and publish outranks edit", () => {
  // Why these two keys: `pages.edit` is the lowest grade that still excludes a
  // read-only member; `pages.publish` additionally excludes `editor`, matching
  // the product rule that editors draft and managers ship.
  assert.equal(rolePhase5HasCapability("viewer", EDIT), false);
  assert.equal(rolePhase5HasCapability("editor", EDIT), true);
  assert.equal(rolePhase5HasCapability("owner", EDIT), true);

  assert.equal(rolePhase5HasCapability("viewer", PUBLISH), false);
  assert.equal(rolePhase5HasCapability("editor", PUBLISH), false);
  assert.equal(rolePhase5HasCapability("manager", PUBLISH), true);
  assert.equal(rolePhase5HasCapability("admin", PUBLISH), true);
  assert.equal(rolePhase5HasCapability("owner", PUBLISH), true);
});
