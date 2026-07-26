import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROFILE_PAGE = readFileSync(
  join(process.cwd(), "src/app/t/[profileCode]/profile-view.tsx"),
  "utf8",
);

const PLATFORM_HOST = readFileSync(
  join(process.cwd(), "src/lib/talent-site/platform-host.ts"),
  "utf8",
);

test("platform host gate limits Max site to app and marketing only", () => {
  assert.match(PLATFORM_HOST, /kind === "app"/);
  assert.match(PLATFORM_HOST, /kind === "marketing"/);
  assert.equal(PLATFORM_HOST.includes("agency"), false);
});

test("profile page renders Max snapshot only on platform hosts", () => {
  assert.match(PROFILE_PAGE, /isTalentProfilePlatformHost/);
  assert.match(PROFILE_PAGE, /resolvePlatformTalentSiteForProfile/);
  assert.match(PROFILE_PAGE, /PlatformTalentMaxSiteView/);
  assert.match(PROFILE_PAGE, /hostCtx\.kind === "agency"/);
  assert.equal(PROFILE_PAGE.includes("TalentSiteNotPublished"), false);
  assert.equal(PROFILE_PAGE.includes("/site/page"), false);
});

test("agency surface keeps legacy template path without early Max return", () => {
  const agencyBranch = PROFILE_PAGE.indexOf('hostCtx.kind === "agency"');
  const platformBranch = PROFILE_PAGE.indexOf("isTalentProfilePlatformHost");
  assert.ok(agencyBranch > 0);
  assert.ok(platformBranch > 0);
  assert.ok(platformBranch < agencyBranch || PROFILE_PAGE.includes("surface:"));
});
