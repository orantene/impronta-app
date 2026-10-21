import assert from "node:assert/strict";
import { test } from "node:test";

import { pageEditHref, storefrontPrefixFromPathname } from "./page-edit-href";

test("TUL-1408: a path-addressed storefront keeps /w/<slug> on page switches", () => {
  assert.equal(pageEditHref("/w/rosa", "agendar"), "/w/rosa/agendar?edit=1");
  assert.equal(pageEditHref("/w/rosa/agendar", ""), "/w/rosa?edit=1");
  assert.equal(pageEditHref("/es/w/rosa/p/about", "book", "panel=pageSettings"), "/es/w/rosa/book?edit=1&panel=pageSettings");
  assert.equal(pageEditHref("/w/rosa", "new-page", "ai=1"), "/w/rosa/new-page?edit=1&ai=1");
});

test("TUL-1408: a branded host is unchanged", () => {
  assert.equal(pageEditHref("/about", "agendar"), "/agendar?edit=1");
  assert.equal(pageEditHref("/", ""), "/?edit=1");
  assert.equal(pageEditHref("/", null, "ai=1"), "/?edit=1&ai=1");
  assert.equal(storefrontPrefixFromPathname("/wonder/page"), "");
});
