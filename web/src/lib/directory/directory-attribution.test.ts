import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDirectoryQueryOrFilter,
  resolveDirectoryAgencyAttribution,
} from "./directory-attribution";

const HUB = "hub-tenant";

describe("resolveDirectoryAgencyAttribution", () => {
  it("drops the agency for talents whose primary roster is the platform hub (independents)", () => {
    const r = resolveDirectoryAgencyAttribution(
      { agencyName: "Tulala", agencyTenantId: HUB, isExclusive: true },
      HUB,
    );
    assert.deepEqual(r, { agencyName: null, agencyTenantId: null, isExclusive: false });
  });

  it("keeps a real agency attribution", () => {
    const row = { agencyName: "Impronta Models", agencyTenantId: "t-1", isExclusive: true };
    assert.deepEqual(resolveDirectoryAgencyAttribution(row, HUB), row);
  });

  it("keeps attribution when the hub is unknown", () => {
    const row = { agencyName: "Tulala", agencyTenantId: HUB, isExclusive: false };
    assert.deepEqual(resolveDirectoryAgencyAttribution(row, null), row);
  });
});

describe("buildDirectoryQueryOrFilter", () => {
  it("matches name and profile code", () => {
    assert.equal(
      buildDirectoryQueryOrFilter("QA"),
      "display_name.ilike.%QA%,profile_code.ilike.%QA%",
    );
    assert.match(buildDirectoryQueryOrFilter("TAL-93940"), /profile_code\.ilike\.%TAL-93940%/);
  });

  it("strips characters that would break the or() grammar", () => {
    const f = buildDirectoryQueryOrFilter("a,b(c)%");
    assert.equal(f, "display_name.ilike.%a b c%,profile_code.ilike.%a b c%");
  });

  it("returns null for an empty query", () => {
    assert.equal(buildDirectoryQueryOrFilter("  ,() "), null);
  });
});
