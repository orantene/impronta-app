import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const msg = (l: string) => JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8"));

test("TUL-804: the design step promises no fixed number of looks", () => {
  for (const l of ["en", "es"]) {
    const sub: string = msg(l).public.onboarding.design.sub;
    assert.doesNotMatch(sub, /\b(three|tres|two|dos|3|2)\b/i, l);
  }
});

test("TUL-991: the saving screen says 'you can close this' once and promises no ten seconds", () => {
  for (const l of ["en", "es"]) {
    const b = msg(l).public.onboarding.building;
    for (const k of ["sub", "subTalent"]) {
      assert.doesNotMatch(b[k], /close this|cerrar esto/i, `${l}.${k}`);
      assert.doesNotMatch(b[k], /ten seconds|diez segundos/i, `${l}.${k}`);
    }
    assert.match(b.canClose, /close this|cerrar esto/i);
  }
});

test("TUL-801: a failed read with nothing understood offers the manual path, not 'Looks good'", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/steps/understood-step.tsx"), "utf8");
  assert.match(src, /readFailedEmpty/);
  assert.match(src, /understood\.continueManual/);
  assert.match(src, /understood\.titleFailed/);
  for (const l of ["en", "es"]) {
    const u = msg(l).public.onboarding.understood;
    assert.ok(u.continueManual && u.titleFailed && u.subFailed, l);
  }
});

test("TUL-811: step 1 cards look like choices (radio mark, no chevron) and react to a tap at once", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/steps/choose-step.tsx"), "utf8");
  assert.doesNotMatch(src, /M7 3\.5L12\.5 9 7 14\.5/);
  assert.match(src, /data-testid=\{`onb-choice-mark-\$\{choice\}`\}/);
  assert.match(src, /touch-manipulation/);
});
