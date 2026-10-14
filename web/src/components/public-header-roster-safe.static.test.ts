/**
 * TUL-505 — business / studio / both workspaces 404 on `/directory`.
 * Legacy PublicHeader must not hardcode search → /directory; it must use
 * directoryOrBookHref / resolveRosterSafeHref like SiteHeaderComponent.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HEADER = path.join(WEB_ROOT, "src/components/public-header.tsx");
const DIRECTORY_PAGE = path.join(WEB_ROOT, "src/app/(public)/directory/page.tsx");

describe("TUL-505 roster-safe public directory links", () => {
  it("PublicHeader imports roster helpers and does not hardcode search /directory", () => {
    const src = fs.readFileSync(HEADER, "utf8");
    assert.match(src, /directoryOrBookHref/);
    assert.match(src, /resolveRosterSafeHref/);
    assert.match(src, /filterNavItemsForRoster/);
    assert.match(src, /rosterEnabled/);
    assert.doesNotMatch(
      src,
      /href=\{headerHref\("\/directory"\)\}/,
      "search button must not hardcode /directory",
    );
  });

  it("public /directory soft-redirects business workspaces to /book", () => {
    const src = fs.readFileSync(DIRECTORY_PAGE, "utf8");
    assert.match(src, /directoryOrBookHref/);
    assert.match(src, /rosterEnabled/);
    assert.match(src, /redirect\(/);
    assert.doesNotMatch(
      src,
      /await assertRosterWorkspace/,
      "public directory must soft-redirect, not hard-404",
    );
  });
});
