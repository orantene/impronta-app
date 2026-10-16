import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { classifySingleRole, type SingleRoleFacts } from "./single-role-report";

const base: SingleRoleFacts = {
  talentProfileId: "tp1",
  profileCode: "TAL-10001",
  isDemo: false,
  ownSitePublished: true,
  ownedTenantIds: [],
  selfRosterTenantIds: [],
};

test("TUL-75 back-fill report: demo and the real talent are never candidates", () => {
  assert.equal(classifySingleRole({ ...base, isDemo: true, ownSitePublished: false }), "excluded");
  assert.equal(classifySingleRole({ ...base, profileCode: "TAL-93938", ownSitePublished: false }), "excluded");
});

test("TUL-75 back-fill report: talent-only accounts without a published own page are the only write candidates", () => {
  assert.equal(classifySingleRole({ ...base, ownSitePublished: false }), "talent_without_own_page");
  assert.equal(classifySingleRole(base), "complete");
  assert.equal(classifySingleRole({ ...base, talentProfileId: null, profileCode: null, ownSitePublished: false }), "complete");
});

test("TUL-75 back-fill report: owners are classified by their own team, never by another studio's roster", () => {
  assert.equal(classifySingleRole({ ...base, talentProfileId: null, profileCode: null, ownedTenantIds: ["w1"] }), "studio_owner_only");
  assert.equal(classifySingleRole({ ...base, ownedTenantIds: ["w1"], selfRosterTenantIds: ["w1"] }), "complete");
  assert.equal(classifySingleRole({ ...base, ownedTenantIds: ["w1"], selfRosterTenantIds: ["other"] }), "owner_profile_not_on_own_team");
});

test("TUL-75 back-fill report script is read-only and refuses production unless asked", () => {
  const src = readFileSync(join(__dirname, "..", "..", "..", "scripts", "onboarding-single-role-dry-run.mts"), "utf8");
  assert.doesNotMatch(src, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(src, /--apply/);
  assert.match(src, /REFUSED/);
  assert.doesNotMatch(src, /email/i);
});
