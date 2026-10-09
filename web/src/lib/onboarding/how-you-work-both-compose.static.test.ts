/**
 * TUL-86: "How you work" myself -> both failed with
 * `forbidden: capability=agency.site_admin.homepage.compose reason=no_membership`.
 * Cause: provisionFreeWorkspaceFromTalent inserted the owner membership but left
 * the process-level membership list (30 s) cached from before the insert, so the
 * starter-content scaffold, which checks capabilities AS the user, saw no
 * membership. Fix is in provisioning; capability checks are untouched.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

test("provisioning forgets the cached membership list after the membership insert and before starter content", () => {
  const src = read("src/lib/server-actions/talent-workspace-provision.ts");
  const insert = src.indexOf('.from("agency_memberships")');
  const forget = src.indexOf("forgetUserTenantMemberships(userId)");
  const starter = src.indexOf("await onboardStarterContent(");
  assert.ok(insert > 0 && forget > insert, "forget must come after the membership insert");
  assert.ok(starter > forget, "forget must come before onboardStarterContent");
});

test("a throw from starter content is contained and cannot skip the roster step", () => {
  const src = read("src/lib/server-actions/talent-workspace-provision.ts");
  const tryAt = src.lastIndexOf("try {", src.indexOf("await onboardStarterContent("));
  const catchAt = src.indexOf("} catch (err) {", tryAt);
  const roster = src.indexOf("await ensureSelfRosterSiteVisible(");
  assert.ok(tryAt > 0 && catchAt > tryAt, "starter content must sit inside try/catch");
  assert.ok(roster > catchAt, "roster step must run after the catch");
});

test("capability checks are NOT weakened: homepage compose and composition-actions still require the capability", () => {
  const home = read("src/lib/site-admin/server/homepage.ts");
  assert.match(
    home,
    /export async function ensureHomepageRow[\s\S]*?await requirePhase5Capability\("agency\.site_admin\.homepage\.compose", tenantId\)/,
  );
  const comp = read("src/lib/site-admin/edit-mode/composition-actions.ts");
  assert.ok(!/bypassCapabilityCheck/.test(comp), "composition-actions must never bypass the capability check");
  assert.ok(
    (home.match(/requirePhase5Capability\(|requireCapabilityFn\(/g) ?? []).length >= 5,
    "homepage.ts compose/publish paths still gate on requirePhase5Capability",
  );
  const prov = read("src/lib/server-actions/talent-workspace-provision.ts");
  assert.ok(!/bypassCapabilityCheck/.test(prov), "provisioning must not bypass capability checks");
});
