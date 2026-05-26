import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ACTIONS_SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/server/actions.ts"),
  "utf8",
);

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
