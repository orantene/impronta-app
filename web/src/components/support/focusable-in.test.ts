import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("use-focus-trap uses getClientRects visibility and defers restore (TUL-534 / GRK-097)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "use-focus-trap.ts"), "utf8");
  assert.match(src, /isFocusableVisible/);
  assert.match(src, /scheduleFrame|requestAnimationFrame/);
  assert.doesNotMatch(src, /offsetParent/);
  assert.match(src, /restoreTarget/);
});
