import test from "node:test";
import assert from "node:assert/strict";
import { buildArrivalNextSteps } from "./arrival-next-steps";

const t = (key: string) => key.replace(/^public\.onboarding\.arrival\./, "");

test("onb1-19: business next steps never pre-tick Visit your website", () => {
  const steps = buildArrivalNextSteps({ siteLive: false, business: true }, t);
  assert.equal(steps[0]?.label, "nextVisit");
  assert.equal(steps[0]?.done, false);
  assert.ok(steps.every((s) => s.done === false));
});

test("talent (not live) next steps start unticked", () => {
  const steps = buildArrivalNextSteps({ siteLive: false, business: false }, t);
  assert.equal(steps[0]?.label, "nextTalentPhotos");
  assert.ok(steps.every((s) => s.done === false));
});

test("siteLive marks only the live fact as done", () => {
  const steps = buildArrivalNextSteps({ siteLive: true, business: false }, t);
  assert.equal(steps[0]?.label, "nextTalentLive");
  assert.equal(steps[0]?.done, true);
  assert.equal(steps[1]?.done, false);
  assert.equal(steps[2]?.done, false);
});
