/**
 * TUL-444 B1 Step 2 — public Max-site Data Cache must be talent-tagged and
 * never keyed on a guest / session.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const DIR = new URL(".", import.meta.url).pathname;
const CACHE_SRC = readFileSync(join(DIR, "public-site-data-cache.server.ts"), "utf8");
const LOAD_SRC = readFileSync(join(DIR, "load-max-site.ts"), "utf8");
const SEO_SRC = readFileSync(join(DIR, "max-site-seo-facts.server.ts"), "utf8");
const LOCALE_SRC = readFileSync(join(DIR, "talent-site-locale.server.ts"), "utf8");
const OFFERINGS_SRC = readFileSync(
  join(DIR, "../../talent/offerings-public.ts"),
  "utf8",
);
const RENDER_SRC = readFileSync(join(DIR, "render-max-site.tsx"), "utf8");

describe("public Max-site data cache (TUL-444 B1 Step 2)", () => {
  it("tags with tagForTalentSite site kind and refuses guest keys", () => {
    assert.match(CACHE_SRC, /tagForTalentSite/);
    assert.match(CACHE_SRC, /["']site["']/);
    assert.match(CACHE_SRC, /unstable_cache/);
    assert.match(CACHE_SRC, /NEVER a guest/i);
    // Cache key parts are talent + part only (no request identity fields).
    assert.doesNotMatch(CACHE_SRC, /guestId|visitorId|ipAddress|cookieName/);
    assert.match(CACHE_SRC, /\[KEY_PREFIX, part, talentProfileId,/);
  });

  it("wraps the Step 1 slow public loaders", () => {
    assert.match(LOAD_SRC, /cachePublicTalentSiteData/);
    assert.match(LOAD_SRC, /cachePublicTalentSiteData\(\s*talentProfileId,\s*["']pages["']/);
    assert.match(LOAD_SRC, /cachePublicTalentSiteData\(\s*talentProfileId,\s*["']designSlug["']/);
    assert.match(LOAD_SRC, /cachePublicTalentSiteData\(\s*talentProfileId,\s*["']planKey["']/);
    assert.match(SEO_SRC, /cachePublicTalentSiteData/);
    assert.match(SEO_SRC, /["']seoFacts["']/);
    assert.match(LOCALE_SRC, /cachePublicTalentSiteData/);
    assert.match(OFFERINGS_SRC, /cachePublicTalentSiteData/);
  });

  it("never caches the per-visitor experiment seed or actor session", () => {
    assert.match(RENDER_SRC, /resolveExperimentRenderContext/);
    assert.equal(RENDER_SRC.includes("cachePublicTalentSiteData"), false);
    assert.match(RENDER_SRC, /timed\(\s*["']maxSite\.experiment["']/);
    assert.match(RENDER_SRC, /getCachedActorSession/);
  });

  it("fans tenant/identity/demo/themeTokens together on the public path", () => {
    assert.match(RENDER_SRC, /pTokens/);
    assert.match(
      RENDER_SRC,
      /await Promise\.all\(\[\s*pTenant,\s*pIdentity,\s*pDemo,\s*pTokens,\s*\]\)/,
    );
  });
});
