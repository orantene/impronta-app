import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  showUnrosteredTalentWall,
  talentSiteRowIsOwnSite,
  unrosteredWallBypassesShell,
} from "./unrostered-wall";

test("the wall is only for no roster and no own site", () => {
  assert.equal(showUnrosteredTalentWall({ hasRoster: false, hasOwnSite: false }), true);
  assert.equal(showUnrosteredTalentWall({ hasRoster: true, hasOwnSite: false }), false);
  assert.equal(showUnrosteredTalentWall({ hasRoster: false, hasOwnSite: true }), false);
  assert.equal(showUnrosteredTalentWall({ hasRoster: true, hasOwnSite: true }), false);
});

test("the shell is skipped only for a proven empty roster and site", () => {
  assert.equal(
    unrosteredWallBypassesShell({ proven: true, hasRoster: false, hasOwnSite: false }),
    true,
  );
  assert.equal(
    unrosteredWallBypassesShell({ proven: false, hasRoster: false, hasOwnSite: false }),
    false,
  );
  assert.equal(
    unrosteredWallBypassesShell({ proven: true, hasRoster: true, hasOwnSite: false }),
    false,
  );
  assert.equal(
    unrosteredWallBypassesShell({ proven: true, hasRoster: false, hasOwnSite: true }),
    false,
  );
});

test("a published personal site is an own site; a draft row is not", () => {
  assert.equal(talentSiteRowIsOwnSite(null), false);
  assert.equal(talentSiteRowIsOwnSite({ status: "draft" }), false);
  assert.equal(talentSiteRowIsOwnSite({ status: "published" }), true);
  assert.equal(talentSiteRowIsOwnSite({ sitePublishedAt: "2026-10-01T00:00:00Z" }), true);
  assert.equal(talentSiteRowIsOwnSite({ hasPublishedSnapshot: true }), true);
});

test("the talent root decides the wall from roster and site, not a missed profile read", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(workspace)/talent/page.tsx"),
    "utf8",
  );
  assert.match(page, /unrosteredWallBypassesShell/);
  assert.match(page, /loadTalentSelfProfileByUser/);
  assert.match(page, /loadUnrosteredWallFacts/);
  assert.doesNotMatch(page, /\.maybeSingle\(\)/);
});

test("the talent layout skips the shell when the wall is the correct state", () => {
  const layout = readFileSync(
    join(process.cwd(), "src/app/(workspace)/talent/layout.tsx"),
    "utf8",
  );
  assert.match(layout, /unrosteredWallBypassesShell/);
  assert.match(layout, /loadUnrosteredWallFacts/);
  const gateAt = layout.indexOf("if (unrosteredWallBypassesShell(wallFacts))");
  const shellAt = layout.indexOf("<TalentShellClient");
  assert.ok(gateAt > 0 && shellAt > gateAt);
});

test("platform talent routes keep the path, so Money is not rewritten onto Today", () => {
  const ctx = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/state/context.tsx"),
    "utf8",
  );
  const skips = ctx.match(/tenantSlugRef\.current \|\| platformTalentRoutesRef\.current/g) ?? [];
  assert.ok(skips.length >= 2);
});

test("the talent route syncer does not navigate, so Money cannot be pushed back to Today", () => {
  const syncer = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/_talent-page-route-syncer.tsx"),
    "utf8",
  );
  assert.match(syncer, /navigate:\s*false/);
  assert.doesNotMatch(syncer, /setTalentPage\(page\)/);
});
