import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { shouldShowOnboardingHero, visibleRailGroups } from "./profile-shell-rail-policy";

const groups = [{ slug: "profile" }, { slug: "back_office" }];
const root = join(process.cwd(), "src/components/admin/shell/internal");

test("TUL-724: Back office group is hidden for the talent editing themselves", () => {
  assert.deepEqual(visibleRailGroups(groups, true).map((g) => g.slug), ["profile"]);
  assert.equal(visibleRailGroups(groups, false).length, 2);
});

test("TUL-724: onboarding completeness hero never shows on a published profile", () => {
  assert.equal(shouldShowOnboardingHero({ completeness: 17, profileStatus: "published", dismissed: false }), false);
  assert.equal(shouldShowOnboardingHero({ completeness: 17, profileStatus: "draft", dismissed: false }), true);
});

test("TUL-724: drawer wires the policy", () => {
  const src = readFileSync(join(root, "drawers/profile-shell/TalentProfileShellDrawer.tsx"), "utf8");
  assert.match(src, /visibleRailGroups\(profileEditorLayout\.groups, isSelf\)/);
  assert.match(src, /shouldShowOnboardingHero\(/);
});

test("TUL-724: Privacidad opens the privacy drawer, not the profile editor", () => {
  const src = readFileSync(join(root, "talent/pages/SettingsPage.tsx"), "utf8");
  const block = src.slice(src.indexOf('key: "privacy"'), src.indexOf('key: "download-data"'));
  assert.match(block, /openDrawer\("talent-privacy"\)/);
  assert.doesNotMatch(block, /openSection/);
});

test("TUL-724: privacy drawer lists only the talent's own agencies, no fake ones", () => {
  const src = readFileSync(join(root, "talent-drawers/agency.tsx"), "utf8");
  assert.doesNotMatch(src, /Acme Models|Praline London/);
});
