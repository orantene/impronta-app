import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-518 / A2-2: selecting a /start choice card must not insert a growing
// confirmation line under that card (layout jump). Confirmation lives in a
// reserved slot below the radiogroup.
test("choose-step reserves confirmation height outside each card", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/onboarding/steps/choose-step.tsx"),
    "utf8",
  );
  assert.match(src, /min-h-\[2\.6em\]/);
  assert.match(src, /data-testid="onb-creates"/);
  // Confirmation must not nest inside the per-choice button wrapper.
  assert.doesNotMatch(
    src,
    /data-testid=\{`onb-choice-\$\{choice\}`\}[\s\S]{0,800}data-testid="onb-creates"/,
  );
});

test("start page title is absolute Tulala (no template doubling)", () => {
  const src = readFileSync(join(process.cwd(), "src/app/start/page.tsx"), "utf8");
  assert.match(src, /title:\s*\{\s*absolute:\s*"Tulala"\s*\}/);
  assert.doesNotMatch(src, /title:\s*"Tulala"/);
});
