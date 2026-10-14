import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-809: one consent mechanism on the /start save step: the required checkbox.
test("the save step shows the 18+ / Terms checkbox and no second 'By continuing' line", () => {
  const s = readFileSync(join(process.cwd(), "src/components/onboarding/steps/save-step.tsx"), "utf8");
  assert.match(s, /data-testid="onb-age-terms"/);
  assert.doesNotMatch(s, /public\.onboarding\.save\.terms"\)/);
});
