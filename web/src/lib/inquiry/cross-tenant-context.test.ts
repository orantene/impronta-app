/**
 * Tests cross-tenant context describer.
 *
 * The DB-touching loadCrossTenantContext is covered in integration land
 * (verified live during D5 migration: see commit message). This test
 * locks in the pure description logic so the badge copy stays stable.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { describeCrossTenantContext } from "./cross-tenant-context";

test("single-tenant inquiry → null badge", () => {
  assert.equal(
    describeCrossTenantContext({
      isCrossTenant: false,
      parties: [{ owningPartyType: "workspace", owningPartyId: "t1", talentCount: 3 }],
    }),
    null,
  );
});

test("inquiry with no talents → null badge", () => {
  assert.equal(
    describeCrossTenantContext({ isCrossTenant: false, parties: [] }),
    null,
  );
});

test("2 agencies → 'Routed to 2 workspaces'", () => {
  assert.equal(
    describeCrossTenantContext({
      isCrossTenant: true,
      parties: [
        { owningPartyType: "agency", owningPartyId: "milan", talentCount: 2 },
        { owningPartyType: "agency", owningPartyId: "berlin", talentCount: 1 },
      ],
    }),
    "Routed to 2 workspaces",
  );
});

test("1 agency + 1 independent talent → 'Routed to 1 workspace + 1 independent'", () => {
  assert.equal(
    describeCrossTenantContext({
      isCrossTenant: true,
      parties: [
        { owningPartyType: "agency", owningPartyId: "milan", talentCount: 1 },
        { owningPartyType: "talent", owningPartyId: "tal", talentCount: 1 },
      ],
    }),
    "Routed to 1 workspace + 1 independent",
  );
});

test("3 agencies → singular workspace correctly pluralized", () => {
  assert.equal(
    describeCrossTenantContext({
      isCrossTenant: true,
      parties: [
        { owningPartyType: "agency", owningPartyId: "a", talentCount: 1 },
        { owningPartyType: "workspace", owningPartyId: "b", talentCount: 1 },
        { owningPartyType: "workspace", owningPartyId: "c", talentCount: 1 },
      ],
    }),
    "Routed to 3 workspaces",
  );
});

test("only independents (rare but valid) → 'Routed to N independent'", () => {
  assert.equal(
    describeCrossTenantContext({
      isCrossTenant: true,
      parties: [
        { owningPartyType: "talent", owningPartyId: "a", talentCount: 1 },
        { owningPartyType: "talent", owningPartyId: "b", talentCount: 1 },
      ],
    }),
    "Routed to 2 independent",
  );
});
