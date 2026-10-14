/**
 * TUL-591: SEO builders for Business workspace public pages (/w/<slug>).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  businessFixedSitemapPaths,
  businessLocalBusinessJsonLd,
  clampMetaDescription,
  clampMetaTitle,
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
} from "./business-workspace-seo";

test("clampMetaDescription leaves short copy alone and trims whitespace", () => {
  assert.equal(clampMetaDescription("  Hola mundo  "), "Hola mundo");
});

test("clampMetaDescription cuts at a word boundary with an ellipsis", () => {
  const long = "palabra ".repeat(60);
  const out = clampMetaDescription(long);
  assert.ok(out.length <= META_DESCRIPTION_MAX);
  assert.ok(out.endsWith("…"));
  assert.ok(!/\s…$/.test(out));
});

test("clampMetaTitle caps long titles", () => {
  const out = clampMetaTitle("x".repeat(200));
  assert.ok(out.length <= META_TITLE_MAX);
});

test("business sitemap paths drop roster routes and add /book", () => {
  assert.deepEqual(businessFixedSitemapPaths("business"), ["/contact", "/book"]);
});

test("talent sitemap paths keep the roster routes", () => {
  assert.deepEqual(businessFixedSitemapPaths("talent"), [
    "/contact",
    "/directory",
    "/models",
  ]);
});

test("LocalBusiness JSON-LD carries name, url, address and sameAs", () => {
  const doc = businessLocalBusinessJsonLd({
    name: "Studio Sol",
    url: "https://tulala.digital/w/sol",
    description: "Manicure y pedicure",
    phone: "+52 998 000 0000",
    email: "hola@sol.mx",
    city: "Cancun",
    country: "MX",
    image: "https://cdn.example/og.jpg",
    sameAs: ["https://instagram.com/sol", "", "  "],
  });
  assert.ok(doc);
  assert.equal(doc["@type"], "LocalBusiness");
  assert.equal(doc.name, "Studio Sol");
  assert.equal(doc.url, "https://tulala.digital/w/sol");
  assert.deepEqual(doc.sameAs, ["https://instagram.com/sol"]);
  assert.deepEqual(doc.address, {
    "@type": "PostalAddress",
    addressLocality: "Cancun",
    addressCountry: "MX",
  });
});

test("LocalBusiness JSON-LD is null without a name (empty workspace)", () => {
  assert.equal(businessLocalBusinessJsonLd({ name: "  ", url: "https://x.y" }), null);
});

test("LocalBusiness JSON-LD omits empty optional fields", () => {
  const doc = businessLocalBusinessJsonLd({ name: "A", url: "https://a.b" });
  assert.ok(doc);
  assert.equal("address" in doc, false);
  assert.equal("telephone" in doc, false);
  assert.equal("sameAs" in doc, false);
});
