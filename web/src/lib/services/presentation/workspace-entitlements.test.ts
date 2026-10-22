import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { businessServicePagesAllowed } from "@/lib/services/business-pages/page-model";
import { presentationEntitlementsForPlan } from "./trade-defaults";

describe("workspace plan -> own service pages", () => {
  it("every paid workspace plan, Website included, gets own pages", () => {
    for (const p of ["website", "studio", "agency", "network"]) {
      assert.equal(presentationEntitlementsForPlan(p).allowedModes.includes("own_page"), true, p);
      assert.equal(businessServicePagesAllowed({ flagOn: true, planTier: p }), true, p);
    }
  });
  it("free and unknown plans get none", () => {
    for (const p of ["free", null, undefined, "legacy"]) {
      assert.equal(presentationEntitlementsForPlan(p).allowedModes.includes("own_page"), false, String(p));
    }
  });
});
