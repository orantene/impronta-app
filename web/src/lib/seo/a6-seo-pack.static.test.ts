import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { shouldEmitPlatformJsonLd } from "./platform-json-ld-gate";
import { serviceReviewsJsonLd } from "@/lib/talent-site/service-page-reviews";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("A6: next.config sends noindex on private-token paths and keeps existing headers", () => {
  const cfg = read("next.config.ts");
  for (const p of ["manage", "pay", "c/t", "ticket", "visit", "r", "link"]) {
    assert.ok(cfg.includes(`"/${p}/:path*"`) || cfg.includes(`"/${p}"`), `missing ${p}`);
  }
  assert.match(cfg, /PRIVATE_NOINDEX_PATHS/);
  assert.match(cfg, /source: "\/p\/:slug"/);
  assert.match(cfg, /headers: securityHeaders/);
});

test("A6: platform JSON-LD is not mounted on talent-site hosts", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /shouldEmitPlatformJsonLd/);
  assert.equal(shouldEmitPlatformJsonLd({ hasPublicScope: false, hostContext: "talent_site" }), false);
  assert.equal(shouldEmitPlatformJsonLd({ hasPublicScope: true, hostContext: null }), false);
  assert.equal(shouldEmitPlatformJsonLd({ hasPublicScope: false, hostContext: null }), true);
});

test("A6: Service JSON-LD carries no talent aggregateRating", () => {
  const out = serviceReviewsJsonLd(
    { average: 4.8, count: 12, reviews: [] },
    false,
  );
  assert.equal("aggregateRating" in out, false);
});

test("A6: /book emits canonical + hreflang", () => {
  assert.match(read("src/app/(public)/book/page.tsx"), /buildTenantLocaleAlternates\(locale, "\/book"\)/);
});

test("A6: /directory metadata applies the paging and filter indexing policy", () => {
  assert.match(read("src/app/(public)/directory/page.tsx"), /applyDirectoryIndexing/);
});
