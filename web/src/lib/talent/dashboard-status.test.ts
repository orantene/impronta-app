import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dashboardPlanKind,
  dashboardPublishKind,
  dashboardStatusCopy,
  type DashboardPlanKind,
  type DashboardPublishKind,
} from "./dashboard-status";
import { websiteFlowCopy } from "./website-flow";

const PLANS: DashboardPlanKind[] = ["free", "paid"];
const PUBLISH: DashboardPublishKind[] = ["live", "draft"];

function allStrings(plan: DashboardPlanKind, publish: DashboardPublishKind, es: boolean): string[] {
  const c = dashboardStatusCopy({ plan, publish, es });
  return [
    c.unlockTitle,
    c.readyTitle,
    c.unlockedCardTitle,
    c.activateCta,
    c.leftLine(1),
    c.leftLine(4),
    c.publicPageTitle,
    c.publicPageHint,
  ];
}

describe("plan and publish kinds", () => {
  it("treats pro and max as paid and free or missing as free", () => {
    assert.equal(dashboardPlanKind("free"), "free");
    assert.equal(dashboardPlanKind(null), "free");
    assert.equal(dashboardPlanKind(undefined), "free");
    assert.equal(dashboardPlanKind("pro"), "paid");
    assert.equal(dashboardPlanKind("max"), "paid");
  });
  it("is live when either the site or the profile is published", () => {
    assert.equal(dashboardPublishKind({ sitePublished: false }), "draft");
    assert.equal(dashboardPublishKind({ sitePublished: true }), "live");
    assert.equal(dashboardPublishKind({ sitePublished: false, profilePublished: true }), "live");
  });
});

describe("dashboard status copy, free/paid x live/draft", () => {
  for (const es of [false, true]) {
    for (const plan of PLANS) {
      for (const publish of PUBLISH) {
        it(`${plan} ${publish} ${es ? "ES" : "EN"} has no contradictions and no em dashes`, () => {
          const joined = allStrings(plan, publish, es).join("\n");
          assert.ok(!joined.includes("—"), "no em dash");
          if (plan === "paid") assert.ok(!/free|gratis/i.test(joined), `paid copy says free: ${joined}`);
          if (publish === "live") assert.ok(!/not published|no está publicada/i.test(joined));
          const c = dashboardStatusCopy({ plan, publish, es });
          if (publish === "draft") assert.ok(!/is live|en línea/i.test(c.publicPageTitle));
        });
      }
    }
  }

  it("free keeps the free-website pitch in both languages", () => {
    assert.equal(dashboardStatusCopy({ plan: "free", publish: "draft", es: true }).unlockTitle, "Desbloquea tu sitio gratis");
    assert.equal(dashboardStatusCopy({ plan: "free", publish: "draft", es: false }).leftLine(2), "2 things left before your free website");
    assert.equal(dashboardStatusCopy({ plan: "free", publish: "draft", es: true }).leftLine(1), "1 cosa falta para tu sitio gratis");
  });

  it("paid ES left line matches the QA report case", () => {
    assert.equal(dashboardStatusCopy({ plan: "paid", publish: "draft", es: true }).leftLine(4), "4 cosas faltan para tu sitio");
  });
});

describe("Profile editor caption follows the plan (TUL-579)", () => {
  it("paid never says free in either language", () => {
    for (const es of [false, true]) {
      assert.doesNotMatch(dashboardStatusCopy({ plan: "paid", publish: "draft", es }).countsTowardSite, /free|gratis/i);
    }
  });
  it("free keeps the free caption", () => {
    assert.equal(dashboardStatusCopy({ plan: "free", publish: "draft", es: true }).countsTowardSite, "Cuenta para tu sitio gratis");
  });
});

describe("websiteFlowCopy follows the plan", () => {
  for (const es of [false, true]) {
    for (const state of ["notReady", "ready", "preview", "published"] as const) {
      it(`paid never says free in ${state} ${es ? "ES" : "EN"}`, () => {
        const c = websiteFlowCopy(state, 16, es, "", "paid");
        assert.ok(!/free|gratis/i.test(JSON.stringify(c)), JSON.stringify(c));
      });
    }
  }
  it("free still pitches the free website when not ready", () => {
    assert.match(websiteFlowCopy("notReady", 16, true).todayTitle, /gratis/);
    assert.match(websiteFlowCopy("notReady", 16, true, "", "free").todayTitle, /gratis/);
  });
});
