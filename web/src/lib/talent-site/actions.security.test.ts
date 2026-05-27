import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { talentPlanGrantsCapability } from "@/lib/access/talent-membership";
import { isTemplateAllowedForTier } from "@/lib/talent-site/templates/registry";

const ACTIONS_SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/server/actions.ts"),
  "utf8",
);

function sourceFor(fnName: string): string {
  const start = ACTIONS_SRC.indexOf(`export async function ${fnName}`);
  assert.ok(start >= 0, `${fnName} source located`);
  const next = ACTIONS_SRC.indexOf("\nexport ", start + 1);
  return ACTIONS_SRC.slice(start, next === -1 ? undefined : next);
}

test("talent site actions never write to cms_* tables", () => {
  assert.equal(ACTIONS_SRC.includes("cms_pages"), false);
  assert.equal(ACTIONS_SRC.includes("cms_page_sections"), false);
  assert.equal(ACTIONS_SRC.includes("cms_sections"), false);
  assert.equal(ACTIONS_SRC.includes("cms_page_revisions"), false);
});

test("talent site actions use tier-specific plan guards and denial copy", () => {
  assert.match(ACTIONS_SRC, /plan_required/);
  assert.match(ACTIONS_SRC, /planDeniedMessage/);
  assert.match(ACTIONS_SRC, /planDeniedMessage\("template"\)/);
  assert.match(ACTIONS_SRC, /planDeniedMessage\("custom_builder"\)/);
  assert.match(ACTIONS_SRC, /assertTalentCanEditPersonalSite|assertTalentCanPublishPersonalSite/);
  assert.match(ACTIONS_SRC, /applyTalentSiteTemplateAction/);
  assert.match(ACTIONS_SRC, /saveTalentSiteCompositionAction/);
  assert.match(ACTIONS_SRC, /talent_sites/);
  assert.match(ACTIONS_SRC, /talent_site_revisions/);
  assert.match(ACTIONS_SRC, /bustTalentSiteCache/);
  assert.match(ACTIONS_SRC, /requireTalentSelf\(/);
  assert.equal(ACTIONS_SRC.includes("requireTalentSelfScope"), false);
  assert.equal(ACTIONS_SRC.includes("Upgrade to Max to edit or publish again"), false);
});

test("lower-tier template and composition denials resolve to plan_required", () => {
  assert.equal(isTemplateAllowedForTier("stage", "pro"), false);
  assert.equal(isTemplateAllowedForTier("editorial", "free"), false);
  assert.equal(talentPlanGrantsCapability("talent_pro", "personalSiteCustomBuilder"), false);
  assert.equal(talentPlanGrantsCapability("talent_basic", "personalSiteCustomBuilder"), false);

  const applyTemplateSrc = sourceFor("applyTalentSiteTemplateAction");
  assert.match(applyTemplateSrc, /!assertTalentCanApplyTemplate\(scope\.planKey\)[\s\S]*code: "plan_required"/);
  assert.match(applyTemplateSrc, /!assertTemplateAllowedForPlan\(scope\.planKey, input\.templateKey\)[\s\S]*code: "plan_required"/);

  const saveCompositionSrc = sourceFor("saveTalentSiteCompositionAction");
  assert.match(saveCompositionSrc, /!assertTalentCanSaveComposition\(scope\.planKey\)[\s\S]*code: "plan_required"/);
  assert.match(saveCompositionSrc, /planDeniedMessage\("custom_builder"\)/);
});

test("talent site writes are scoped to requireTalentSelf profile", () => {
  for (const fnName of [
    "createTalentPersonalSiteDraftAction",
    "saveTalentPersonalSiteDraftAction",
    "publishTalentPersonalSiteAction",
    "unpublishTalentPersonalSiteAction",
    "applyTalentSiteTemplateAction",
    "setTalentSiteCompositionModeAction",
    "saveTalentSiteCompositionAction",
  ]) {
    const src = sourceFor(fnName);
    assert.match(src, /const scope = await requireTalentSelf\(\)/, `${fnName} uses requireTalentSelf`);
    assert.equal(src.includes("requireTalentSelfScope"), false, `${fnName} is not tenant-targetable`);
    assert.equal(src.includes("input.talentProfileId"), false, `${fnName} has no target profile input`);
    assert.equal(src.includes("input.profileCode"), false, `${fnName} has no target code input`);
  }

  for (const fnName of [
    "saveTalentPersonalSiteDraftAction",
    "publishTalentPersonalSiteAction",
    "unpublishTalentPersonalSiteAction",
    "applyTalentSiteTemplateAction",
    "setTalentSiteCompositionModeAction",
    "saveTalentSiteCompositionAction",
  ]) {
    assert.match(
      sourceFor(fnName),
      /\.eq\("talent_profile_id", scope\.talentProfile\.id\)/,
      `${fnName} mutations are profile-scoped`,
    );
  }
});
