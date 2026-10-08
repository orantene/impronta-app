import assert from "node:assert/strict";
import test from "node:test";

import {
  choiceFromNext,
  choiceToPath,
  freshAppRoleForChoice,
  homeSurfaceForChoice,
  pathToChoice,
  resolveBuildPath,
  type OnboardingChoice,
} from "./choice";
import { planProfilePromotion } from "./talent-profile-promotion";
import { runChoiceProvisioning, type ChoiceProvisionDeps } from "./provision-for-choice";

/**
 * A tiny in-memory database whose steps behave like the real "ensure" writers:
 * look first, create only what is missing.
 */
type Db = {
  profile: { app_role: string; account_status: string; home_surface_preference: string | null };
  talent_profiles: { id: string; user_id: string; workflow_status: string; visibility: string }[];
  talent_sites: { talent_profile_id: string }[];
  hub_roster: { talent_profile_id: string }[];
  agencies: { id: string; slug: string }[];
  agency_memberships: { tenant_id: string; role: string }[];
  agency_domains: { tenant_id: string; hostname: string }[];
  roster: { tenant_id: string; talent_profile_id: string; direct_booking_enabled: boolean }[];
};

function freshDb(appRole = "client"): Db {
  return {
    profile: { app_role: appRole, account_status: "onboarding", home_surface_preference: null },
    talent_profiles: [], talent_sites: [], hub_roster: [], agencies: [], agency_memberships: [], agency_domains: [], roster: [],
  };
}

function fakeDeps(db: Db, opts: { failMembershipOnce?: boolean } = {}): ChoiceProvisionDeps<null, { url: string }> {
  let membershipFails = opts.failMembershipOnce ?? false;
  return {
    async promoteFreshAppRole(role) {
      if (db.profile.app_role === "client" && db.profile.account_status === "onboarding") db.profile.app_role = role;
    },
    async ensureTalentProfile() {
      let tp = db.talent_profiles.find((r) => r.user_id === "u1");
      if (!tp) { tp = { id: "tp1", user_id: "u1", workflow_status: "draft", visibility: "hidden" }; db.talent_profiles.push(tp); }
      if (!db.hub_roster.some((r) => r.talent_profile_id === tp.id)) db.hub_roster.push({ talent_profile_id: tp.id });
      return { ok: true, talentProfileId: tp.id, profileCode: "TAL-1" };
    },
    async ensureTalentSite(id) {
      if (!db.talent_sites.some((r) => r.talent_profile_id === id)) db.talent_sites.push({ talent_profile_id: id });
      return { ok: true, site: { url: "https://x.tulala.digital" } };
    },
    async ensureWorkspace() {
      const owned = db.agency_memberships.find((m) => m.role === "owner");
      if (owned) {
        const a = db.agencies.find((x) => x.id === owned.tenant_id)!;
        return { ok: true, tenantId: a.id, tenantSlug: a.slug, reusedFreeWorkspace: false, detail: null };
      }
      const slug = db.agencies.some((a) => a.slug === "studio") ? `studio-${db.agencies.length + 1}` : "studio";
      const agency = { id: `ag${db.agencies.length + 1}`, slug };
      db.agencies.push(agency);
      if (membershipFails) {
        membershipFails = false;
        db.agencies = db.agencies.filter((a) => a.id !== agency.id); // rollback, as provisionWorkspaceFromLead does
        return { ok: false, code: "provision_failed", message: "membership failed" };
      }
      db.agency_memberships.push({ tenant_id: agency.id, role: "owner" });
      return { ok: true, tenantId: agency.id, tenantSlug: agency.slug, reusedFreeWorkspace: false, detail: null };
    },
    async ensureWorkspaceDomain(tenantId, slug) {
      const hostname = `${slug}.tulala.digital`;
      if (!db.agency_domains.some((d) => d.hostname === hostname)) db.agency_domains.push({ tenant_id: tenantId, hostname });
      return { ok: true };
    },
    async ensureSelfRoster(tenantId, talentProfileId) {
      if (!db.roster.some((r) => r.tenant_id === tenantId && r.talent_profile_id === talentProfileId)) {
        db.roster.push({ tenant_id: tenantId, talent_profile_id: talentProfileId, direct_booking_enabled: true });
      }
      return { ok: true };
    },
    async promoteTalentProfileLive(id) {
      const tp = db.talent_profiles.find((r) => r.id === id)!;
      Object.assign(tp, planProfilePromotion(tp) ?? {});
      return { ok: true };
    },
    async setHomeSurface(surface) {
      db.profile.home_surface_preference = surface;
      return { ok: true };
    },
  };
}

function counts(db: Db) {
  return {
    app_role: db.profile.app_role,
    home: db.profile.home_surface_preference,
    talent_profiles: db.talent_profiles.length,
    talent_sites: db.talent_sites.length,
    hub_roster: db.hub_roster.length,
    agencies: db.agencies.length,
    owner_memberships: db.agency_memberships.length,
    agency_domains: db.agency_domains.length,
    self_roster: db.roster.length,
  };
}

const EXPECTED: Record<OnboardingChoice, ReturnType<typeof counts>> = {
  myself: { app_role: "talent", home: "talent", talent_profiles: 1, talent_sites: 1, hub_roster: 1, agencies: 0, owner_memberships: 0, agency_domains: 0, self_roster: 0 },
  studio: { app_role: "agency_staff", home: "workspace", talent_profiles: 0, talent_sites: 0, hub_roster: 0, agencies: 1, owner_memberships: 1, agency_domains: 1, self_roster: 0 },
  both: { app_role: "talent", home: "workspace", talent_profiles: 1, talent_sites: 1, hub_roster: 1, agencies: 1, owner_memberships: 1, agency_domains: 1, self_roster: 1 },
};

for (const choice of ["myself", "studio", "both"] as const) {
  test(`${choice}: creates exactly the ticket's records`, async () => {
    const db = freshDb();
    const r = await runChoiceProvisioning(choice, fakeDeps(db));
    assert.equal(r.ok, true);
    assert.deepEqual(counts(db), EXPECTED[choice]);
    if (choice === "both") {
      assert.equal(db.roster[0].direct_booking_enabled, true);
      assert.equal(db.agency_domains[0].hostname, "studio.tulala.digital");
      assert.equal(db.talent_profiles[0].workflow_status, "approved");
      assert.equal(db.talent_profiles[0].visibility, "public");
    }
  });

  test(`${choice}: running twice creates nothing new`, async () => {
    const db = freshDb();
    await runChoiceProvisioning(choice, fakeDeps(db));
    const once = counts(db);
    const again = await runChoiceProvisioning(choice, fakeDeps(db));
    assert.equal(again.ok, true);
    assert.deepEqual(counts(db), once);
  });
}

test("a failed owner membership leaves no orphan and the retry has no -2 slug", async () => {
  const db = freshDb();
  const first = await runChoiceProvisioning("studio", fakeDeps(db, { failMembershipOnce: true }));
  assert.equal(first.ok, false);
  assert.equal(db.agencies.length, 0);
  const second = await runChoiceProvisioning("studio", fakeDeps(db));
  assert.equal(second.ok, true);
  assert.deepEqual(db.agencies.map((a) => a.slug), ["studio"]);
});

test("roles are additive: a talent adding a studio keeps app_role talent", async () => {
  const db = freshDb("talent");
  db.profile.account_status = "active";
  await runChoiceProvisioning("studio", fakeDeps(db));
  assert.equal(db.profile.app_role, "talent");
  assert.equal(db.agency_memberships.length, 1);
});

test("both: a failed self roster fails the build (she must be bookable)", async () => {
  const db = freshDb();
  const deps = fakeDeps(db);
  deps.ensureSelfRoster = async () => ({ ok: false, code: "self_roster_failed", message: "x" });
  const r = await runChoiceProvisioning("both", deps);
  assert.equal(r.ok, false);
});

test("non-fatal steps report warnings instead of failing", async () => {
  const db = freshDb();
  const deps = fakeDeps(db);
  deps.ensureWorkspaceDomain = async () => ({ ok: false, code: "domain_insert_failed", message: "x" });
  const r = await runChoiceProvisioning("studio", deps);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.warnings, ["domain:domain_insert_failed"]);
});

test("free-workspace reuse still links the owner for both", async () => {
  const db = freshDb();
  const deps = fakeDeps(db);
  deps.ensureWorkspace = async () => ({ ok: true, tenantId: "existing", tenantSlug: "mine", reusedFreeWorkspace: true, detail: null });
  const r = await runChoiceProvisioning("both", deps);
  assert.equal(r.ok, true);
  assert.deepEqual(db.roster.map((x) => x.tenant_id), ["existing"]);
});

test("choice mapping and precedence: the AI never overrides an explicit choice", () => {
  assert.equal(choiceToPath("myself"), "talent");
  assert.equal(choiceToPath("studio"), "business");
  assert.equal(choiceToPath("both"), "both");
  for (const c of ["myself", "studio", "both"] as const) assert.equal(pathToChoice(choiceToPath(c)), c);
  assert.equal(homeSurfaceForChoice("myself"), "talent");
  assert.equal(homeSurfaceForChoice("both"), "workspace");
  assert.equal(freshAppRoleForChoice("studio"), "agency_staff");
  let aiCalled = false;
  const ai = () => { aiCalled = true; return "talent" as const; };
  assert.equal(resolveBuildPath({ choice: "studio", statePath: "talent", aiPath: ai }), "business");
  assert.equal(aiCalled, false);
  assert.equal(resolveBuildPath({ choice: null, statePath: "both", aiPath: ai }), "both");
  assert.equal(resolveBuildPath({ choice: null, statePath: null, aiPath: ai }), "talent");
});

test("choiceFromNext reads the Google next URL", () => {
  assert.equal(choiceFromNext("/onboarding?choice=both"), "both");
  assert.equal(choiceFromNext("/onboarding?x=1&choice=studio"), "studio");
  assert.equal(choiceFromNext("/onboarding?choice=admin"), null);
  assert.equal(choiceFromNext("/talent/profile"), null);
  assert.equal(choiceFromNext(null), null);
});

test("both: profile ends approved/public; a live profile is never downgraded", async () => {
  assert.deepEqual(planProfilePromotion({ workflow_status: "draft", visibility: "hidden" }), { workflow_status: "approved", visibility: "public" });
  assert.equal(planProfilePromotion({ workflow_status: "published", visibility: "public" }), null);
  assert.deepEqual(planProfilePromotion({ workflow_status: "approved", visibility: "hidden" }), { visibility: "public" });
  const db = freshDb();
  db.talent_profiles.push({ id: "tp1", user_id: "u1", workflow_status: "published", visibility: "public" });
  await runChoiceProvisioning("both", fakeDeps(db));
  assert.equal(db.talent_profiles[0].workflow_status, "published");
  assert.equal(db.roster[0].direct_booking_enabled, true);
});

test("both: a failed profile promotion fails the build (retry finishes it)", async () => {
  const db = freshDb();
  const deps = fakeDeps(db);
  deps.promoteTalentProfileLive = async () => ({ ok: false, code: "talent_profile_publish_failed", message: "x" });
  assert.equal((await runChoiceProvisioning("both", deps)).ok, false);
  assert.equal((await runChoiceProvisioning("both", fakeDeps(db))).ok, true);
  assert.equal(db.talent_profiles[0].visibility, "public");
});

<<<<<<< HEAD
test("myself: the profile ends approved/public; studio never promotes", async () => {
  const db = freshDb();
  const r = await runChoiceProvisioning("myself", fakeDeps(db));
  assert.equal(r.ok, true);
  assert.equal(db.talent_profiles[0].workflow_status, "approved");
  assert.equal(db.talent_profiles[0].visibility, "public");

  const studio = freshDb();
  const deps = fakeDeps(studio);
  let called = false;
  deps.promoteTalentProfileLive = async () => { called = true; return { ok: true }; };
  await runChoiceProvisioning("studio", deps);
  assert.equal(called, false);
});

test("myself: a failed promotion fails the build so Finish never says ready on a draft profile", async () => {
  const db = freshDb();
  const deps = fakeDeps(db);
  deps.promoteTalentProfileLive = async () => ({ ok: false, code: "talent_profile_publish_failed", message: "x" });
  assert.equal((await runChoiceProvisioning("myself", deps)).ok, false);
  assert.equal((await runChoiceProvisioning("myself", fakeDeps(db))).ok, true);
  assert.equal(db.talent_profiles[0].visibility, "public");
=======
test("both: her own talent site is created after the profile is live and returned", async () => {
  const db = freshDb();
  const deps = fakeDeps(db);
  const seen: string[] = [];
  const site = deps.ensureTalentSite;
  const live = deps.promoteTalentProfileLive;
  deps.promoteTalentProfileLive = async (id) => { seen.push("live"); return live(id); };
  deps.ensureTalentSite = async (id) => { seen.push("site"); return site(id); };
  const r = await runChoiceProvisioning("both", deps);
  assert.equal(r.ok, true);
  assert.deepEqual(seen, ["live", "site"]);
  assert.ok(r.ok && r.site);
});

test("both: a failed talent site is a warning (not fatal) and a retry finishes it", async () => {
  const db = freshDb();
  const deps = fakeDeps(db);
  deps.ensureTalentSite = async () => ({ ok: false, code: "site_publish_failed", message: "x" });
  const r = await runChoiceProvisioning("both", deps);
  assert.ok(r.ok);
  assert.ok(r.ok && r.warnings.includes("site:site_publish_failed"));
  assert.equal(r.ok && r.site, null);
  assert.equal(db.talent_sites.length, 0);
  assert.equal((await runChoiceProvisioning("both", fakeDeps(db))).ok, true);
  assert.equal(db.talent_sites.length, 1);
});

test("studio never creates a talent site", async () => {
  const db = freshDb();
  await runChoiceProvisioning("studio", fakeDeps(db));
  assert.equal(db.talent_sites.length, 0);
});

test("myself and studio never call the promotion", async () => {
  for (const c of ["myself", "studio"] as const) {
    const db = freshDb();
    const deps = fakeDeps(db);
    let called = false;
    deps.promoteTalentProfileLive = async () => { called = true; return { ok: true }; };
    await runChoiceProvisioning(c, deps);
    assert.equal(called, false, c);
  }
>>>>>>> refs/b6/2741
});
