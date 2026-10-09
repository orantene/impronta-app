import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { siteScaffoldComplete } from "./site-scaffold-complete";

// TUL-213 / TUL-214: /talent/page-builder must never write a talent_sites row
// on render, and the explicit create click must refresh the client state.

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

test("page-builder route is read-only and shows the create control", () => {
  const page = read("app/(workspace)/talent/page-builder/page.tsx");
  assert.equal(/provisionTalentMaxSite|provisionTalentPersonalSiteIfMissing|ensureMaxSiteAction/.test(page), false);
  assert.equal(page.includes(".insert("), false);
  assert.equal(page.includes(".upsert("), false);
  assert.match(page, /siteScaffoldComplete\(siteRes, pagesRes\)/);
  assert.match(page, /canEdit && !siteExists[\s\S]{0,400}<PageBuilderCreateSite/);
});

test("TUL-347: business owners open the live storefront editor, not English admin/website first", () => {
  const page = read("app/(workspace)/talent/page-builder/page.tsx");
  assert.match(page, /resolveWorkspaceSiteEditorUrl/);
  // Must not unconditionally redirect(target.href) when href was admin/website.
  assert.equal(/if \(target\.kind === "workspace"\) redirect\(target\.href\)/.test(page), false);
  const helper = read("lib/talent-site/workspace-site-editor-url.ts");
  assert.match(helper, /panel: "sections"/);
  assert.match(helper, /buildEditorPanelUrl/);
});

test("the create card only calls the action from the click and refreshes client state", () => {
  const card = read("components/talent/site/CreateMySiteCard.tsx");
  assert.match(card, /router\.refresh\(\)/);
  assert.match(card, /resetPublicPageBootstrap\(\)/);
  assert.match(card, /invalidateWebsiteEligibility\(\)/);
  // refresh happens only after a successful create
  assert.ok(card.indexOf("if (!res.ok)") < card.indexOf("router.refresh()"));
  const wrapper = read("components/talent/site/PageBuilderCreateSite.tsx");
  assert.equal(/useEffect|ensureMaxSiteAction/.test(wrapper), false);
  assert.match(wrapper, /DashboardLocaleProvider/);
});

test("settings panels show a hint, not editors, while no site exists", () => {
  const panels = read("components/talent/site/TalentMaxSiteSettingsPanels.tsx");
  assert.match(panels, /!state\.siteExists/);
  assert.ok(panels.indexOf("!state.siteExists") < panels.indexOf("<SlugEditor state={state}"));
});

test("new strings have es and no em dashes", () => {
  const es = read("components/admin/shell/internal/dashboard-i18n-website.ts");
  const sources = [
    read("components/talent/site/PageBuilderCreateSite.tsx"),
    read("components/talent/site/TalentMaxSiteSettingsPanels.tsx"),
  ].join("\n");
  for (const key of [
    "Create your website to use the page builder",
    "Back to my presence",
    "Create your own website first. Its address, logo and pages will appear here.",
  ]) {
    assert.ok(sources.includes(key), `missing en for ${key}`);
    const line = es.split(`"${key}":`)[1]?.split("\n")[0];
    assert.ok(line, `missing es for ${key}`);
    assert.equal(line.includes("—"), false);
  }
});

test("siteScaffoldComplete: missing or partial scaffold means no site", () => {
  const ok = { data: null, error: null };
  assert.equal(siteScaffoldComplete(ok, { data: [], error: null }), false);
  assert.equal(
    siteScaffoldComplete(
      { data: { site_slug: "a", shell_tree: [{}] }, error: null },
      { data: [{ is_home: true }], error: null },
    ),
    true,
  );
  assert.equal(
    siteScaffoldComplete(
      { data: { site_slug: "a", shell_tree: [{}] }, error: { message: "x" } },
      { data: [{ is_home: true }], error: null },
    ),
    false,
  );
});
