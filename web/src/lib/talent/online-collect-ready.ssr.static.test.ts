/**
 * PAY-2 Option B — SSR must wire onlineCollectReady from platform Checkout
 * through dataSources → ServicesCatalogFilter → CatalogBookingSheet.
 * Talent Connect must not appear in the guest gate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, "../..");

function read(rel: string): string {
  return readFileSync(join(WEB_SRC, rel), "utf8");
}

test("loadServicesCatalogSources sets onlineCollectReady via platform Checkout", () => {
  const src = read("components/home/homepage-cms-data-sources.ts");
  assert.match(src, /isPlatformCheckoutReady/);
  assert.match(src, /resolveOnlineCollectReady/);
  assert.match(src, /onlineCollectReady/);
  assert.doesNotMatch(src, /stripe_account_status/);
});

test("services_catalog render passes onlineCollectReady into the island", () => {
  const renderSrc = read("lib/site-admin/builder-node/render.tsx");
  const catalogCase = renderSrc.slice(renderSrc.indexOf('case "services_catalog"'));
  assert.match(catalogCase, /onlineCollectReady=\{options\.dataSources\.onlineCollectReady\}/);
  const filterSrc = read("lib/site-admin/builder-node/services-catalog-filter.tsx");
  assert.match(filterSrc, /onlineCollectReady=\{onlineCollectReady\}/);
  assert.match(filterSrc, /CatalogBookingSheet/);
  assert.match(filterSrc, /CatalogPurchaseMount/);
});

test("helper documents Option B — platform only", () => {
  const helper = read("lib/talent/online-collect-ready.ts");
  assert.match(helper, /Option B/);
  assert.match(helper, /STRIPE_SECRET_KEY/);
  assert.match(helper, /Connect/);
});
