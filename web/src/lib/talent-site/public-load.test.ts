import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_PAGE_SRC = readFileSync(
  join(process.cwd(), "src/app/t/[profileCode]/page.tsx"),
  "utf8",
);

const PUBLIC_LOAD_SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/server/public-load.ts"),
  "utf8",
);

const RESOLVE_SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/resolve-platform-talent-site.ts"),
  "utf8",
);

test("profile route resolves Max site via platform helper on Tulala hosts", () => {
  assert.match(PUBLIC_PAGE_SRC, /resolvePlatformTalentSiteForProfile/);
  assert.match(PUBLIC_PAGE_SRC, /TalentSiteRenderer|PlatformTalentMaxSiteView/);
  assert.equal(PUBLIC_PAGE_SRC.includes("draft_snapshot"), false);
});

test("public loader uses published RPC first", () => {
  assert.match(PUBLIC_LOAD_SRC, /talent_public_site_for_profile_code/);
  assert.match(PUBLIC_LOAD_SRC, /published_snapshot/);
  assert.match(PUBLIC_LOAD_SRC, /validateTalentSiteSnapshot/);
});

test("draft preview is owner-only via user_id match", () => {
  assert.match(PUBLIC_LOAD_SRC, /loadTalentPublicSiteDraftForOwner/);
  assert.match(PUBLIC_LOAD_SRC, /user_id !== userId/);
  assert.match(RESOLVE_SRC, /previewDraft/);
  assert.match(RESOLVE_SRC, /loadTalentPublicSiteDraftForOwner/);
});

test("public resolver plan-gates the published site (read-time degradation)", () => {
  // A lapsed Pro/Max trial must stop serving the premium page. The resolver
  // reads the talent's CURRENT plan and falls back when it no longer permits
  // the published composition — without mutating the stored snapshot.
  assert.match(RESOLVE_SRC, /planPermitsPublishedTalentSite/);
  assert.match(RESOLVE_SRC, /loadCurrentTalentPlanKey/);
  assert.match(RESOLVE_SRC, /talent_plan_key/);
  // The gate must fail OPEN (null plan → render) so a DB hiccup never
  // downgrades a paying talent's site.
  assert.match(RESOLVE_SRC, /planKey && !planPermitsPublishedTalentSite/);

  const GATE_SRC = readFileSync(
    join(process.cwd(), "src/lib/talent-site/plan-permits-snapshot.ts"),
    "utf8",
  );
  assert.match(GATE_SRC, /compositionMode === "custom" && tier !== "max"/);
  assert.match(GATE_SRC, /isTemplateAllowedForTier/);
});

test("dashboard public URL is canonical /t/code without /site", () => {
  const dashState = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/dashboard-state.ts"),
    "utf8",
  );
  assert.match(dashState, /publicSiteUrl: profileCode \? `\/t\/\$\{profileCode\}`/);
  assert.equal(dashState.includes("/site`"), false);
});
