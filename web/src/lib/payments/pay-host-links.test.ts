import test from "node:test";
import assert from "node:assert/strict";

import { hostServesTenantPayLinks } from "./pay-host-links";
import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";

test("tenant hosts show the conversation and receipt links; app and unknown hosts do not", () => {
  for (const k of ["agency", "hub", "talent_site"]) assert.equal(hostServesTenantPayLinks(k), true, k);
  for (const k of ["app", "marketing", "unknown"]) assert.equal(hostServesTenantPayLinks(k), false, k);
});

test("TUL-1252: the pay page is reachable from the client account host, its tenant-only links are not offered there", () => {
  assert.equal(isPathAllowedForHostKind("app", "/pay/3fcz1trb5eujnjwayx2j"), true);
  assert.equal(isPathAllowedForHostKind("app", "/r/anything"), false);
  assert.equal(hostServesTenantPayLinks("app"), false);
});
