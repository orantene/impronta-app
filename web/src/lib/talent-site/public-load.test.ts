import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_PAGE_SRC = readFileSync(
  join(process.cwd(), "src/app/t/[profileCode]/site/page.tsx"),
  "utf8",
);

const PUBLIC_LOAD_SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/server/public-load.ts"),
  "utf8",
);

test("public route loads via public loader and never reads draft_snapshot in page", () => {
  assert.match(PUBLIC_PAGE_SRC, /loadTalentPublicSiteByProfileCode/);
  assert.match(PUBLIC_PAGE_SRC, /TalentPersonalSiteRenderer/);
  assert.match(PUBLIC_PAGE_SRC, /TalentSiteNotPublished/);
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
});
