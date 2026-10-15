import assert from "node:assert/strict";
import test from "node:test";

import { servedCanonical } from "./public-page-canonical";

test("servedCanonical uses the trusted origin plus the path actually served", () => {
  assert.equal(
    servedCanonical("https://staging.tulala.digital/en/w/qa/p/services", "/en/w/qa/services?x=1"),
    "https://staging.tulala.digital/en/w/qa/services",
  );
});

test("servedCanonical is null without a trusted origin or a served path", () => {
  assert.equal(servedCanonical(undefined, "/a"), null);
  assert.equal(servedCanonical("https://a.com/x", null), null);
  assert.equal(servedCanonical("not a url", "/a"), null);
});

import { assemblePageMetadata } from "./public-page-canonical";

const page = {
  title: "Services",
  meta_title: null,
  meta_description: null,
  og_title: null,
  og_description: null,
  og_image_url: null,
  noindex: false,
  canonical_url: null,
};

test("assemblePageMetadata: title comes from the page, in-place canonical replaces hreflang", () => {
  const m = assemblePageMetadata(page, { alternates: { canonical: "x", languages: { en: "y" } } }, "https://a.com/w/q/services");
  assert.equal(m.title, "Services");
  assert.deepEqual(m.alternates, { canonical: "https://a.com/w/q/services" });
  assert.equal(m.openGraph.title, "Services");
});

test("assemblePageMetadata: operator canonical wins; default keeps alternates", () => {
  const withOp = assemblePageMetadata({ ...page, canonical_url: "https://op.com/s" }, { alternates: { languages: { en: "y" } } }, "https://a.com/z");
  assert.deepEqual(withOp.alternates, { languages: { en: "y" }, canonical: "https://op.com/s" });
  const plain = assemblePageMetadata(page, { alternates: { canonical: "c" } }, null);
  assert.deepEqual(plain.alternates, { canonical: "c" });
});
