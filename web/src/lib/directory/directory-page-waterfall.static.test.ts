import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// TUL-737: the directory pages awaited independent loads one after another
// (about 5 s cold). Independent loads must start together.
const root = join(process.cwd(), "src/app");
const marketing = readFileSync(join(root, "(marketing)/global-directory/page.tsx"), "utf8");
const publicPage = readFileSync(join(root, "(public)/directory/page.tsx"), "utf8");

describe("directory pages do not waterfall independent loads", () => {
  it("global directory starts hub, saved and favorite loads before the main batch resolves", () => {
    assert.doesNotMatch(marketing, /=\s*await getPlatformHubTenant\(\)/);
    assert.doesNotMatch(marketing, /await Promise\.all\(\[\s*getSavedTalentIds\(\)/);
    const hubAt = marketing.indexOf("getPlatformHubTenant()");
    const mainAt = marketing.indexOf("await Promise.all([\n    loadDirectoryFacets()");
    assert.ok(hubAt > -1 && mainAt > -1 && hubAt < mainAt, "hub load must start before the main await");
  });

  it("/directory loads settings, saved ids and tenant scope together", () => {
    assert.doesNotMatch(publicPage, /const publicSettings = await getPublicSettings\(\)/);
    assert.doesNotMatch(publicPage, /const initialSavedIds = await getSavedTalentIds\(\)/);
    assert.doesNotMatch(publicPage, /const publicScope = await getPublicTenantScope\(\)/);
  });
});
