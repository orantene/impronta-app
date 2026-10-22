import test from "node:test";
import assert from "node:assert/strict";
import { urlWithStep } from "./step-url";

test("TUL-812: step goes into the query and keeps the other params", () => {
  assert.equal(urlWithStep("https://x.test/start?lang=es", "essentials"), "https://x.test/start?lang=es&step=essentials");
  assert.equal(urlWithStep("https://x.test/start?step=entry&lang=es", "ready"), "https://x.test/start?step=ready&lang=es");
});

test("TUL-812: camelCase wizard steps (confirmWords, readyToBuild) are mirrored, not dropped", () => {
  assert.equal(urlWithStep("https://x.test/start", "confirmWords"), "https://x.test/start?step=confirmWords");
  assert.equal(urlWithStep("https://x.test/start?lang=es", "readyToBuild"), "https://x.test/start?lang=es&step=readyToBuild");
});

test("no step, or a malformed one, removes the param", () => {
  assert.equal(urlWithStep("https://x.test/start?step=ready", null), "https://x.test/start");
  assert.equal(urlWithStep("https://x.test/start", "<script>"), "https://x.test/start");
});

import { planStepSync, stepForPopTarget } from "./step-url";

test("TUL-812: forward steps push, passing screens rewrite their entry, the first step replaces", () => {
  let p = planStepSync([], "choose");
  assert.deepEqual(p, { op: "replace", stack: ["choose"] });
  p = planStepSync(p.stack, "entry");
  assert.deepEqual(p, { op: "push", stack: ["choose", "entry"] });
  p = planStepSync(p.stack, "reading");
  assert.deepEqual(p, { op: "replace", stack: ["choose", "reading"] });
  p = planStepSync(p.stack, "understood");
  assert.deepEqual(p, { op: "push", stack: ["choose", "reading", "understood"] });
  assert.equal(planStepSync(p.stack, "understood").op, "none");
});

test("TUL-812: the in-app Back pops the entry the browser Back would", () => {
  const p = planStepSync(["choose", "entry", "essentials", "setup"], "essentials");
  assert.deepEqual(p, { op: "back", stack: ["choose", "entry", "essentials"] });
});

test("TUL-812: browser Back reaches earlier settled screens only", () => {
  assert.equal(stepForPopTarget("setup", "essentials"), "essentials");
  assert.equal(stepForPopTarget("readyToBuild", "setup"), "setup");
  assert.equal(stepForPopTarget("save", "readyToBuild"), "readyToBuild");
  assert.equal(stepForPopTarget("understood", "reading"), "entry", "a passing screen falls back to entry");
  assert.equal(stepForPopTarget("setup", "setup"), null);
  assert.equal(stepForPopTarget("essentials", "setup"), null, "forward is not a Back");
  assert.equal(stepForPopTarget("building", "save"), null, "the build is never left");
  assert.equal(stepForPopTarget("arrival", "readyToBuild"), null);
  assert.equal(stepForPopTarget("setup", "<x>"), null);
});

import { resumeLandingStep, urlStepOfLocation } from "./step-url";

test("TUL-812: a deep link lands on its own step within the saved progress, else the saved step", () => {
  assert.equal(resumeLandingStep("setup", "essentials"), "essentials");
  assert.equal(resumeLandingStep("setup", "setup"), "setup");
  assert.equal(resumeLandingStep("essentials", "readyToBuild"), "essentials", "past the saved progress");
  assert.equal(resumeLandingStep("setup", "resume"), "setup", "the resume screen is not a destination");
  assert.equal(resumeLandingStep("setup", null), "setup");
  assert.equal(resumeLandingStep("building", "entry"), "building", "a build in flight is never left");
  assert.equal(resumeLandingStep(undefined, "entry"), null);
  assert.equal(urlStepOfLocation("https://x.test/start?step=essentials&lang=es"), "essentials");
  assert.equal(urlStepOfLocation("https://x.test/start?step=<x>"), null);
  assert.equal(urlStepOfLocation(null), null);
});
