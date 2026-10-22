import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * TUL-1771: a throwing delete/revert/avatar/hero action must still clear its
 * busy spinner and say so. Each busy flag is reset inside a `finally`.
 */
const src = readFileSync(join(process.cwd(), "src/components/media/photo-lightbox.tsx"), "utf8");

test("every busy flag is cleared in a finally block", () => {
  for (const setter of ["setDeleteBusy", "setRevertBusy", "setSetAvatarBusy", "setSetHeroBusy"]) {
    const re = new RegExp(`finally \\{\\s*${setter}\\(false\\);`);
    assert.match(src, re, `${setter}(false) must run in a finally`);
  }
});

test("a failed action shows a translated alert", () => {
  assert.match(src, /role="alert"/);
  assert.match(src, /actionFailed/);
});
