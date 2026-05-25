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

test("dashboard public URL is canonical /t/code without /site", () => {
  const dashState = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/dashboard-state.ts"),
    "utf8",
  );
  assert.match(dashState, /publicSiteUrl: profileCode \? `\/t\/\$\{profileCode\}`/);
  assert.equal(dashState.includes("/site`"), false);
});
