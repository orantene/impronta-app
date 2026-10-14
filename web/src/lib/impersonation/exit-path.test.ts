import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { impersonationExitPath } from "./exit-path";

describe("impersonationExitPath", () => {
  it("platform staff return to the platform console", () => {
    assert.equal(impersonationExitPath("super_admin"), "/platform/admin");
  });
  it("agency staff and unknown roles return to /admin", () => {
    assert.equal(impersonationExitPath("agency_staff"), "/admin");
    assert.equal(impersonationExitPath(null), "/admin");
  });
});
