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

test("live3-01: create/fallback My website hrefs skip the public-page redirect alias", () => {
  const target = read("src/lib/talent-site/my-website-target.ts");
  assert.match(target, /CREATE_WEBSITE_HREF = "\/talent\/site"/);
  assert.doesNotMatch(target, /CREATE_WEBSITE_HREF = "\/talent\/public-page"/);

  const menu = read(
    "src/components/admin/shell/internal/page-modules/TalentAccountMenuSection.tsx",
  );
  assert.match(menu, /\/talent\/site/);
  assert.doesNotMatch(menu, /\/talent\/public-page/);
});

test("TUL-536: the talent shell reloads when a redirect carries it into /admin", () => {
  const shell = read("src/components/admin/shell/admin-shell-client.tsx");
  const guard = read("src/components/admin/shell/talent-leaves-for-admin-guard.tsx");
  assert.match(guard, /pathIsWorkspaceAdmin\(pathname\)/);
  assert.match(shell, /<TalentLeavesForAdminGuard \/>/);
});

test("TUL-536: /admin/website renders the Website surface (not Overview) for a business owner", () => {
  const route = read("src/app/(workspace)/[tenantSlug]/admin/website/page.tsx");
  assert.match(route, /<PageRouteSyncer page="website" \/>/);
  const shell = read("src/components/admin/shell/internal/page-modules/WorkspaceShell.tsx");
  assert.match(shell, /case "website":\s*body = <WebsitePage \/>/);
});
