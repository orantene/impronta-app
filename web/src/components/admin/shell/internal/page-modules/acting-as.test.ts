import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { actingAsLabel, shouldShowActingAs } from "./acting-as";

describe("shouldShowActingAs", () => {
  it("never shows for an owner on her own talent workspace", () => {
    assert.equal(shouldShowActingAs({ surface: "talent", impersonating: null }), false);
    assert.equal(shouldShowActingAs({ surface: "talent", impersonating: undefined }), false);
  });
  it("shows on the talent surface only while someone is acting as another party", () => {
    assert.equal(shouldShowActingAs({ surface: "talent", impersonating: { tenantName: "Acme" } }), true);
  });
  it("keeps the workspace-surface chip (workspace switcher)", () => {
    assert.equal(shouldShowActingAs({ surface: "workspace", impersonating: null }), true);
  });
});

describe("actingAsLabel", () => {
  it("prefers the workspace name, never an email prefix", () => {
    assert.equal(actingAsLabel({ impersonating: { tenantName: " Acme " }, personName: "Marta" }), "Acme");
    assert.equal(actingAsLabel({ impersonating: null, personName: "Marta" }), "Marta");
    assert.equal(actingAsLabel({ impersonating: { tenantName: " " }, personName: "Marta" }), "Marta");
  });
});
