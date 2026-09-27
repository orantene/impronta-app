/**
 * Lock: unrostered Max sites (tenantId null) must still load services_catalog
 * sources. Without this, free vanity fixtures render the empty catalog while
 * Hablar/dock shows the same offerings.
 *
 * Codex P2: published free sites must not mount demo booking once offerings
 * load — resolve platform hub → catalogBookingLive + booking tenantId.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "render-max-site.tsx"), "utf8");

describe("render-max-site catalog sources (null tenant)", () => {
  it("imports loadServicesCatalogSources for the free-site path", () => {
    assert.match(SRC, /loadServicesCatalogSources/);
  });

  it("detects services_catalog in the page tree when tenantId is absent", () => {
    assert.match(SRC, /pageNeedsServicesCatalog/);
    assert.match(SRC, /kind === "services_catalog"/);
  });

  it("does not resolve empty data sources for every null-tenant page with a catalog", () => {
    // The old gate was: tenantId ? loadBuilder… : Promise.resolve({})
    // which blanked services_catalog on free personal sites.
    assert.match(
      SRC,
      /pageNeedsServicesCatalog\s*\?\s*loadServicesCatalogSources/,
    );
  });

  it("resolves platform hub for free-site booking context (no demo on published)", () => {
    assert.match(SRC, /getPlatformHubTenant/);
    assert.match(SRC, /bookingTenantId/);
    // Must not gate live booking solely on managing tenantId.
    assert.doesNotMatch(
      SRC,
      /catalogBookingLive:\s*Boolean\(tenantId\)\s*&&\s*!draftPreview/,
    );
    assert.match(SRC, /catalogBookingLive\s*=\s*Boolean\(bookingTenantId\)\s*&&\s*!draftPreview/);
  });
});
