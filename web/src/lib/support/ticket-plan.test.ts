import { test } from "node:test";
import assert from "node:assert/strict";

import { ticketPlanTier } from "./ticket-plan";

test("a talent's ticket filed on the network hub shows the talent's plan, not the hub's", () => {
  assert.equal(
    ticketPlanTier({ tenantKind: "hub", tenantPlan: "network", talentPlanKey: "talent_portfolio" }),
    "talent_portfolio",
  );
});

test("a talent with no plan row reads as the free talent plan on the hub", () => {
  assert.equal(
    ticketPlanTier({ tenantKind: "hub", tenantPlan: "network", talentPlanKey: null, hasTalent: true }),
    "talent_basic",
  );
});

test("a workspace ticket keeps the workspace plan", () => {
  assert.equal(
    ticketPlanTier({ tenantKind: "agency", tenantPlan: "agency", talentPlanKey: "talent_portfolio" }),
    "agency",
  );
});

test("no tenant, no talent: no badge", () => {
  assert.equal(ticketPlanTier({ tenantKind: null, tenantPlan: null, talentPlanKey: null }), null);
});
