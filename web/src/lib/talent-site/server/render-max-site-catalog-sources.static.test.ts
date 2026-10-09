/**
 * Lock: unrostered Max sites (tenantId null) must still load services_catalog
 * sources. Without this, free vanity fixtures render the empty catalog while
 * Hablar/dock shows the same offerings.
 *
 * Codex P2: published free sites must not mount demo booking once offerings
 * load — resolve platform hub → catalogBookingLive + booking tenantId.
 *
 * Tip: catalog loading lives in homepage-cms-data-sources
 * (`loadServicesCatalogSources` / `loadPersonalMaxNativeSources`);
 * render-max-site imports the personal-max wrapper.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDER_MAX = readFileSync(join(HERE, "render-max-site.tsx"), "utf8");
const DATA_SOURCES = readFileSync(
  join(HERE, "../../../components/home/homepage-cms-data-sources.ts"),
  "utf8",
);

describe("render-max-site catalog sources (null tenant)", () => {
  it("imports loadPersonalMaxNativeSources for the free-site path", () => {
    assert.match(RENDER_MAX, /loadPersonalMaxNativeSources/);
  });

  it("loadPersonalMaxNativeSources pulls loadServicesCatalogSources", () => {
    assert.match(DATA_SOURCES, /export async function loadServicesCatalogSources/);
    assert.match(DATA_SOURCES, /export async function loadPersonalMaxNativeSources/);
    // TUL-449: chip-only catalog may wrap in withSecondaryReadDegrade; still gated on needCatalog.
    assert.match(
      DATA_SOURCES,
      /needCatalog[\s\S]{0,280}loadServicesCatalogSources\(/,
    );
  });

  it("detects services_catalog in the page tree when tenantId is absent", () => {
    assert.match(RENDER_MAX, /pageNeedsServicesCatalog/);
    assert.match(RENDER_MAX, /kind === "services_catalog"/);
  });

  it("does not resolve empty data sources for every null-tenant page with a catalog", () => {
    // Tip path: null tenant + catalog/portfolio/… → loadPersonalMaxNativeSources
    // with servicesCatalog: pageNeedsServicesCatalog (not Promise.resolve({})).
    assert.match(
      RENDER_MAX,
      /loadPersonalMaxNativeSources\(\s*\{[\s\S]*servicesCatalog:\s*pageNeedsServicesCatalog/,
    );
    // Still branches on tenantId, but the free path must call the personal loader.
    assert.match(
      RENDER_MAX,
      /tenantId\s*\?\s*loadBuilderNodeDataSources[\s\S]*:\s*pageNeedsTalentOfferings[\s\S]*loadPersonalMaxNativeSources/,
    );
  });

  it("resolves platform hub for free-site booking context (no demo on published)", () => {
    assert.match(RENDER_MAX, /getPlatformHubTenant/);
    assert.match(RENDER_MAX, /bookingTenantId/);
    // Must not gate live booking solely on managing tenantId.
    assert.doesNotMatch(
      RENDER_MAX,
      /catalogBookingLive:\s*Boolean\(tenantId\)\s*&&\s*!draftPreview/,
    );
    assert.match(RENDER_MAX, /catalogBookingLive\s*=\s*Boolean\(bookingTenantId\)\s*&&\s*!draftPreview/);
  });

  it("PAY-2 B: stamps onlineCollectReady from platform Checkout, not Connect", () => {
    assert.match(RENDER_MAX, /isPlatformCheckoutReady/);
    assert.match(RENDER_MAX, /onlineCollectReady:\s*isPlatformCheckoutReady\(\)/);
    // Must not gate guests on talent Connect status.
    assert.doesNotMatch(RENDER_MAX, /stripe_account_status/);
    assert.doesNotMatch(RENDER_MAX, /stripeAccountStatus/);
  });
});
