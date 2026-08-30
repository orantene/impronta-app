/**
 * structure-model.test.ts
 *
 * Identity is derived, so every case in the product can be written as a literal.
 * The cases below are the four real ones from the plan plus the two the current
 * app gets wrong: a hybrid with no way to choose a home, and a business owner
 * whose staff-resource rows must not make them look like many people.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { dashboardPathForHomePreference } from "@/lib/auth-flow";
import {
  deriveStructure,
  EMPTY_OWNED_OBJECTS,
  HOME_PATH,
  isHome,
  isRepresented,
  needsHomeChooser,
  primaryRepresentation,
  reachableWorkspaces,
  resolveHome,
  structureGap,
  validHomes,
  type OwnedObjects,
  type WorkspaceRef,
} from "@/lib/tulala/structure-model";

const ws = (over: Partial<WorkspaceRef> = {}): WorkspaceRef => ({
  tenantId: "t-1",
  slug: "luna-wellness",
  displayName: "Luna Wellness",
  planTier: "studio",
  workspaceType: "talent",
  status: "active",
  ...over,
});

const objects = (over: Partial<OwnedObjects> = {}): OwnedObjects => ({
  ...EMPTY_OWNED_OBJECTS,
  ...over,
});

// ─── Derivation ───────────────────────────────────────────────────────────────

test("a brand-new account is unformed, which is a state and not an error", () => {
  assert.equal(deriveStructure(EMPTY_OWNED_OBJECTS), "unformed");
});

test("the nail artist working from home alone is talent-only", () => {
  assert.equal(deriveStructure(objects({ talentProfileId: "tp-1" })), "talent_only");
});

test("the nail artist employed at a spa is still talent-only, not workspace-anything", () => {
  // The spa is not hers. Being on someone's roster is representation, not
  // ownership, and law 5 makes it no obstacle to having a profile.
  const o = objects({
    talentProfileId: "tp-1",
    representedBy: [{ tenantId: "spa-1", isPrimary: true, status: "active" }],
  });
  assert.equal(deriveStructure(o), "talent_only");
  assert.ok(isRepresented(o));
  assert.equal(primaryRepresentation(o)?.tenantId, "spa-1");
});

test("Carlos, who runs a studio and is not talent himself, is workspace-only", () => {
  assert.equal(deriveStructure(objects({ ownedWorkspaces: [ws()] })), "workspace_only");
});

test("Maria, who owns Luna Wellness and does her own massage work, is hybrid", () => {
  const o = objects({ talentProfileId: "tp-1", ownedWorkspaces: [ws()] });
  assert.equal(deriveStructure(o), "hybrid");
});

test("hybrid is a relationship: removing either object changes the answer", () => {
  const hybrid = objects({ talentProfileId: "tp-1", ownedWorkspaces: [ws()] });
  assert.equal(deriveStructure({ ...hybrid, talentProfileId: null }), "workspace_only");
  assert.equal(deriveStructure({ ...hybrid, ownedWorkspaces: [] }), "talent_only");
});

test("staff access to someone else's workspace is not ownership", () => {
  const o = objects({ staffWorkspaces: [ws({ tenantId: "t-2" })] });
  assert.equal(deriveStructure(o), "unformed");
  assert.equal(reachableWorkspaces(o).length, 1);
});

test("owned workspaces are reachable before workspaces you only work in", () => {
  const o = objects({
    ownedWorkspaces: [ws({ tenantId: "mine" })],
    staffWorkspaces: [ws({ tenantId: "theirs" })],
  });
  assert.deepEqual(
    reachableWorkspaces(o).map((w) => w.tenantId),
    ["mine", "theirs"],
  );
});

test("being on your own roster is not representation by an agency", () => {
  // Solo workspaces put their owner on their own roster (ensureSelfRoster).
  // The loader filters owned tenants out; this asserts the shape the loader
  // must produce, so a regression there shows up as a semantic failure here.
  const o = objects({
    talentProfileId: "tp-1",
    ownedWorkspaces: [ws({ tenantId: "solo" })],
    representedBy: [],
  });
  assert.equal(isRepresented(o), false);
});

// ─── Homes ────────────────────────────────────────────────────────────────────

test("a talent-only user has one home and is never asked", () => {
  const o = objects({ talentProfileId: "tp-1" });
  assert.deepEqual(validHomes(o, "talent"), ["talent"]);
  assert.equal(needsHomeChooser(o, "talent", null), false);
  assert.equal(resolveHome(o, "talent", null), "talent");
});

test("a hybrid is asked rather than guessed at", () => {
  // The live bug: app_role for a workspace owner is a STAFF role, so routing
  // sent hybrids to a surface picked by a field that cannot express "both".
  const o = objects({ talentProfileId: "tp-1", ownedWorkspaces: [ws()] });
  assert.deepEqual(validHomes(o, "agency_staff"), ["workspace", "talent"]);
  assert.equal(needsHomeChooser(o, "agency_staff", null), true);
  assert.equal(resolveHome(o, "agency_staff", null), null);
});

test("a hybrid who has chosen is routed and not asked again", () => {
  const o = objects({ talentProfileId: "tp-1", ownedWorkspaces: [ws()] });
  assert.equal(needsHomeChooser(o, "agency_staff", "talent"), false);
  assert.equal(resolveHome(o, "agency_staff", "talent"), "talent");
  assert.equal(HOME_PATH.talent, "/talent");
});

test("a stale preference is discarded, not honoured into a dead end", () => {
  // Chose 'talent', later deleted the profile. Honouring the choice would route
  // to a surface that notFound()s.
  const o = objects({ ownedWorkspaces: [ws()] });
  assert.equal(resolveHome(o, "agency_staff", "talent"), "workspace");
  assert.equal(needsHomeChooser(o, "agency_staff", "talent"), false);
});

test("a buyer account gets the client home only when no object speaks", () => {
  assert.deepEqual(validHomes(EMPTY_OWNED_OBJECTS, "client"), ["client"]);
  // Owning a workspace outranks the stored role — objects beat the field.
  assert.deepEqual(validHomes(objects({ ownedWorkspaces: [ws()] }), "client"), ["workspace"]);
});

test("an unformed account with no useful role has no home at all", () => {
  assert.deepEqual(validHomes(EMPTY_OWNED_OBJECTS, "agency_staff"), []);
  assert.equal(resolveHome(EMPTY_OWNED_OBJECTS, "agency_staff", null), null);
  assert.equal(needsHomeChooser(EMPTY_OWNED_OBJECTS, "agency_staff", null), false);
});

test("isHome rejects anything not a home", () => {
  assert.ok(isHome("talent"));
  assert.ok(!isHome("super_admin"));
  assert.ok(!isHome(null));
  assert.ok(!isHome(""));
});

test("the router and the chooser agree on where every home lives", () => {
  // Two modules map a home to a path: this one, and `auth-flow` (which
  // middleware calls and therefore cannot import a server module). Drift
  // between them means the chooser saves a preference that routing then sends
  // somewhere else, which is unfalsifiable from either file alone.
  for (const home of ["workspace", "talent", "client"] as const) {
    assert.equal(
      dashboardPathForHomePreference(home),
      HOME_PATH[home],
      `${home} must resolve to the same path in both modules`,
    );
  }
  // And the router must reject anything this module would not call a home.
  for (const notAHome of ["admin", "super_admin", "", "/admin", null, undefined]) {
    assert.equal(
      dashboardPathForHomePreference(notAHome),
      null,
      `${JSON.stringify(notAHome)} is not a home and must not resolve to a path`,
    );
    assert.ok(!isHome(notAHome));
  }
});

// ─── Gap ──────────────────────────────────────────────────────────────────────

test("a returning user is never handed a second copy of what they own", () => {
  const existing = objects({ talentProfileId: "tp-1" });
  assert.deepEqual(structureGap(existing, { talentProfile: true, workspace: true }), {
    createTalentProfile: false,
    createWorkspace: true,
    alreadySatisfied: false,
  });
});

test("a recommendation the user already satisfies reports nothing to create", () => {
  const existing = objects({ talentProfileId: "tp-1", ownedWorkspaces: [ws()] });
  const gap = structureGap(existing, { talentProfile: true, workspace: true });
  assert.equal(gap.alreadySatisfied, true);
});

test("wanting nothing creates nothing", () => {
  const gap = structureGap(EMPTY_OWNED_OBJECTS, { talentProfile: false, workspace: false });
  assert.equal(gap.alreadySatisfied, true);
});
