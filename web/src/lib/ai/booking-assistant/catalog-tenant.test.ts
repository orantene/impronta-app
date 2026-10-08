import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogTenantForPublicHost } from "./catalog-tenant";

test("agency host scopes catalog to host tenant", () => {
  assert.equal(catalogTenantForPublicHost("agency", "ten-a"), "ten-a");
});

test("talent-site / hub / platform use null (full public catalog)", () => {
  assert.equal(catalogTenantForPublicHost("talent_site", "ten-hub"), null);
  assert.equal(catalogTenantForPublicHost("app", null), null);
  assert.equal(catalogTenantForPublicHost("platform", "ten-x"), null);
});
