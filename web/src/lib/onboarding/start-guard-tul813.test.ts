import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { FLOW_STEP_OF, FLOW_TOTAL, flowProgressLine, flowShowsCounter, flowStepOf, type FlowLocale } from "./flow";
import type { ModuleStep } from "./module-state";

const progressLine = (step: ModuleStep, locale: FlowLocale): string => flowProgressLine(step, locale);

const stepsInSource = (): string[] => {
  const src = readFileSync(join(process.cwd(), "src/lib/onboarding/module-state.ts"), "utf8");
  const block = /export type ModuleStep =([\s\S]*?);/.exec(src)?.[1] ?? "";
  return [...block.matchAll(/\|\s*"(\w+)"/g)].map((m) => m[1]!);
};

test("TUL-813: every wizard screen maps to a step, and the map has no strays", () => {
  assert.deepEqual([...stepsInSource()].sort(), Object.keys(FLOW_STEP_OF).sort());
});

for (const locale of ["es", "en"] as const) {
  test(`TUL-813 (${locale}): only the review says 4/4; email and code carry no counter; total never grows`, () => {
    const [review, email, code] = (["readyToBuild", "save", "code"] as const).map((s) => progressLine(s, locale));
    assert.match(review, new RegExp(`4/${FLOW_TOTAL}`));
    assert.doesNotMatch(email, /\d\s*\/\s*\d/);
    assert.doesNotMatch(code, /\d\s*\/\s*\d/);
    assert.equal(new Set([review, email, code]).size, 3, "three screens, three different lines");
    for (const step of Object.keys(FLOW_STEP_OF) as ModuleStep[]) {
      const n = flowStepOf(step);
      assert.ok(n >= 1 && n <= FLOW_TOTAL, `${step} -> ${n}`);
      if (flowShowsCounter(step)) assert.match(progressLine(step, locale), new RegExp(`${n}/${FLOW_TOTAL}`), step);
    }
  });

  test(`TUL-813 (${locale}): the counter never goes backwards along the happy path`, () => {
    const path: ModuleStep[] = ["choose", "entry", "reading", "understood", "essentials", "setup", "style", "readyToBuild", "save", "code", "building", "arrival"];
    const ns = path.map(flowStepOf);
    assert.deepEqual(ns, [...ns].sort((a, b) => a - b));
    assert.equal(ns[ns.length - 1], FLOW_TOTAL);
  });
}

test("TUL-813: the wizard shell renders the sub label next to the counter", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/onboarding-module.tsx"), "utf8");
  assert.match(src, /flowProgressLine\(state\.step, locale\)/);
});
