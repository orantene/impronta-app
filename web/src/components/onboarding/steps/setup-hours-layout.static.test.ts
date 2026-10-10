import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// onb1-07: closing an open day must not collapse the hours detail into a
// one-line "Cerrado" and jump the step (misclick on +Agregar un servicio).
test("setup-hours reserves detail slot height under the day grid", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/onboarding/steps/setup-hours.tsx"),
    "utf8",
  );
  assert.match(src, /data-testid="onb-hours-detail"/);
  assert.match(src, /min-h-\[9\.75rem\]/);
  // Closed copy must live inside the reserved slot, not as a sibling that
  // replaces a taller editor at zero reserved height.
  assert.match(
    src,
    /data-testid="onb-hours-detail"[\s\S]*\{copy\.closed\}/,
  );
});
