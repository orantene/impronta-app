import test from "node:test";
import assert from "node:assert/strict";

import { decideAccountTenantSource } from "@/lib/client-account/tenant-source";

import { isPathAllowedForHostKind } from "./surface-allow-list";

// TUL-872: on a hub host (pay.staging.tulala.digital, hub.tulala.digital) the
// `/t/<code>` profile page fetches the client account state. The host gate 404'd
// it, so the guest chat read every visitor as signed out and "Reservar" went dead.
test("TUL-872: hub reaches exactly /api/client/account, nothing else under /api/client", () => {
  assert.equal(isPathAllowedForHostKind("hub", "/api/client/account"), true);
  for (const p of ["/api/client", "/api/client/accounts", "/api/client/account/x", "/api/client/bookings"]) {
    assert.equal(isPathAllowedForHostKind("hub", p), false, `hub must 404 ${p}`);
  }
});

test("TUL-872: the route's own flag decision for a hub host is `hub` (CLIENT_ACCOUNT_HOSTS must list it)", () => {
  const d = decideAccountTenantSource({
    hostKind: "hub",
    talentProfileId: null,
    hostTenantId: "00000000-0000-0000-0000-000000000002",
  });
  assert.deepEqual(d, { source: "host_tenant", flag: "hub" });
});
