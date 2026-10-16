import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { CHOOSE_COPY, FLOW_STEP_OF, FLOW_TOTAL, flowStepOf, flowSubLabel, type FlowLocale } from "./flow";
import type { ModuleStep } from "./module-state";

/** The progress line exactly as the wizard composes it (onboarding-module.tsx, data-testid="onb-step-label"). */
function progressLine(step: ModuleStep, locale: FlowLocale): string {
  const sub = flowSubLabel(step, locale);
  return `${CHOOSE_COPY[locale].progress(flowStepOf(step))}${sub ? ` · ${sub}` : ""}`;
}

const stepsInSource = (): string[] => {
  const src = readFileSync(join(process.cwd(), "src/lib/onboarding/module-state.ts"), "utf8");
  const block = /export type ModuleStep =([\s\S]*?);/.exec(src)?.[1] ?? "";
  return [...block.matchAll(/\|\s*"(\w+)"/g)].map((m) => m[1]!);
};

test("TUL-813: every wizard screen maps to a step, and the map has no strays", () => {
  assert.deepEqual([...stepsInSource()].sort(), Object.keys(FLOW_STEP_OF).sort());
});

for (const locale of ["es", "en"] as const) {
  test(`TUL-813 (${locale}): review, email and code read as 4/4 with distinct labels; total never grows`, () => {
    const lines = (["readyToBuild", "save", "code"] as const).map((s) => progressLine(s, locale));
    for (const l of lines) assert.match(l, new RegExp(`4/${FLOW_TOTAL}`));
    assert.equal(new Set(lines).size, 3, "three screens, three different lines");
    for (const step of Object.keys(FLOW_STEP_OF) as ModuleStep[]) {
      const n = flowStepOf(step);
      assert.ok(n >= 1 && n <= FLOW_TOTAL, `${step} -> ${n}`);
      assert.match(progressLine(step, locale), new RegExp(`${n}/${FLOW_TOTAL}`), step);
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
  assert.match(src, /flowSubLabel\(state\.step, locale\)/);
});
