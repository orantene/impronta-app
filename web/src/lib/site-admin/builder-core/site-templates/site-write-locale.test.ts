import assert from "node:assert/strict";
import { test } from "node:test";

import { siteWriteLocale } from "./site-write-locale";

test("the tenant's default locale wins over the signup UI language", () => {
  // The reported site: identity default es, signed up from an English UI.
  assert.equal(siteWriteLocale({ tenantDefault: "es", explicit: "en" }), "es");
  assert.equal(siteWriteLocale({ tenantDefault: "en", explicit: "es" }), "en");
});

test("without a tenant default the explicit locale applies, then Spanish", () => {
  assert.equal(siteWriteLocale({ tenantDefault: null, explicit: "en" }), "en");
  assert.equal(siteWriteLocale({ tenantDefault: "fr", explicit: undefined }), "es");
  assert.equal(siteWriteLocale({}), "es");
});
