import { test } from "node:test";
import assert from "node:assert/strict";

import { promoSiteOrigin } from "./site-origin";

test("published site gives its host origin", () => {
  assert.equal(promoSiteOrigin([{ site_slug: "ana", status: "published" }], false), "https://ana.tulala.digital");
  assert.equal(promoSiteOrigin([{ site_slug: "ana", status: "published" }], true), "https://ana-demo.tulala.digital");
});

test("draft, missing or invalid slug falls back to the hub path", () => {
  assert.equal(promoSiteOrigin([{ site_slug: "ana", status: "draft" }], false), null);
  assert.equal(promoSiteOrigin([], false), null);
  assert.equal(promoSiteOrigin([{ site_slug: "Bad Slug!", status: "published" }], false), null);
});
