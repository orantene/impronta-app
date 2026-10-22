import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogTenantForPublicHost, loadCatalogWithTalentFallback } from "./catalog-tenant";

test("agency host scopes catalog to host tenant", () => {
  assert.equal(catalogTenantForPublicHost("agency", "ten-a"), "ten-a");
});

test("talent-site / hub / platform use null (full public catalog)", () => {
  assert.equal(catalogTenantForPublicHost("talent_site", "ten-hub"), null);
  assert.equal(catalogTenantForPublicHost("app", null), null);
  assert.equal(catalogTenantForPublicHost("platform", "ten-x"), null);
});

test("empty agency-scoped catalog retries on the talent's direct channel", async () => {
  const calls: Array<string | null> = [];
  const res = await loadCatalogWithTalentFallback(async (t) => {
    calls.push(t);
    return t === null ? ["svc-1", "svc-2"] : [];
  }, "ten-host");
  assert.deepEqual(calls, ["ten-host", null]);
  assert.deepEqual(res.rows, ["svc-1", "svc-2"]);
  assert.equal(res.usedFallback, true);
});

test("a non-empty scoped catalog is used as is (agency isolation kept)", async () => {
  const calls: Array<string | null> = [];
  const res = await loadCatalogWithTalentFallback(async (t) => {
    calls.push(t);
    return ["own"];
  }, "ten-host");
  assert.deepEqual(calls, ["ten-host"]);
  assert.deepEqual(res.rows, ["own"]);
  assert.equal(res.usedFallback, false);
});

test("an unscoped empty catalog does not retry", async () => {
  let n = 0;
  const res = await loadCatalogWithTalentFallback(async () => {
    n += 1;
    return [] as string[];
  }, null);
  assert.equal(n, 1);
  assert.equal(res.usedFallback, false);
});
