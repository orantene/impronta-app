import test from "node:test";
import assert from "node:assert/strict";

import { talentCanonicalOrigin } from "./canonical-hosts";

/**
 * Talent profile canonicals must land on a host robots.txt lets Google crawl.
 *
 * The platform app host serves `Disallow: /`, and on 2026-09-27 every `/t/*`
 * URL in sitemap.xml (apex) declared a canonical on that blocked host. These
 * pin the mapping that fixes it without touching other origins.
 */
test("the platform app host maps to the crawlable apex", () => {
  assert.equal(talentCanonicalOrigin("https://app.tulala.digital"), "https://tulala.digital");
  assert.equal(talentCanonicalOrigin("https://app.tulala.digital/"), "https://tulala.digital");
});

test("other origins pass through unchanged", () => {
  assert.equal(talentCanonicalOrigin("https://tulala.digital"), "https://tulala.digital");
  assert.equal(talentCanonicalOrigin("https://app.pdcvacations.com"), "https://app.pdcvacations.com");
  assert.equal(talentCanonicalOrigin("http://localhost:3000"), "http://localhost:3000");
});

test("a lookalike host is not mistaken for the platform app host", () => {
  assert.equal(
    talentCanonicalOrigin("https://app.tulala.digital.evil.example"),
    "https://app.tulala.digital.evil.example",
  );
});
