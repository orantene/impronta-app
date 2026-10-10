import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("live4-01: talent workspace Edit site hard-navs into admin/website", () => {
  const manager = read("src/components/talent/site/TalentMaxSiteManager.tsx");
  assert.match(manager, /talentLeaveForWorkspaceAdminHref/);
  assert.match(manager, /workspace-primary-edit-site/);
  assert.match(manager, /<a\s[\s\S]*?workspace-primary-edit-site/);

  const card = read("src/components/talent/site/maison-setup/MyWebsiteCard.tsx");
  assert.match(card, /talentLeaveForWorkspaceAdminHref/);
  assert.match(card, /maison-edit-site/);

  const pill = read("src/components/talent/website-reward/WebsiteRewardControl.tsx");
  assert.match(pill, /resolveTalentDashboardMyWebsite/);
  assert.match(pill, /window\.location\.assign\(myWebsite\.editHref\)/);
});
