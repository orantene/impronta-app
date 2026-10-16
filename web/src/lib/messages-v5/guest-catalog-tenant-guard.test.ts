import { test } from "node:test";
import assert from "node:assert/strict";
import { guestCatalogTenantAllowed } from "./guest-catalog-tenant-guard";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const HUB = "cccccccc-0000-0000-0000-000000000003";

test("TUL-1081: agency A host never serves agency B's catalog", () => {
  assert.equal(guestCatalogTenantAllowed({ kind: "agency", tenantId: A }, B, HUB), false);
  assert.equal(guestCatalogTenantAllowed({ kind: "agency", tenantId: A }, HUB, HUB), false);
});

test("TUL-1081: agency host serves its own catalog", () => {
  assert.equal(guestCatalogTenantAllowed({ kind: "agency", tenantId: A }, A, HUB), true);
});

test("TUL-1081: hub host serves only the hub catalog", () => {
  assert.equal(guestCatalogTenantAllowed({ kind: "hub", tenantId: HUB }, HUB, HUB), true);
  assert.equal(guestCatalogTenantAllowed({ kind: "hub", tenantId: HUB }, A, HUB), false);
});

test("TUL-1081: tenantless host (talent site, app, dev) falls back to hub only", () => {
  for (const kind of ["talent_site", "app", "unknown"]) {
    assert.equal(guestCatalogTenantAllowed({ kind, tenantId: null }, HUB, HUB), true);
    assert.equal(guestCatalogTenantAllowed({ kind, tenantId: null }, A, HUB), false);
  }
  assert.equal(guestCatalogTenantAllowed({ kind: "unknown", tenantId: null }, A, null), false);
});
