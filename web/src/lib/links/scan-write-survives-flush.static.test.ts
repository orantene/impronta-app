/**
 * The scan write must be deferred with `after()`, never fire-and-forget.
 *
 * WHY THIS GUARD EXISTS, measured rather than theorised: `/q/<code>` first
 * shipped with `void recordScan(...)`. Three scans of one code on production
 * recorded TWO rows. A serverless instance may freeze the moment the response
 * is flushed, and a floating promise dies with it.
 *
 * Losing SOME rows is worse than losing all of them. A feature that records
 * nothing gets noticed on its first day; one that drops an unpredictable
 * fraction looks like it works, and every number the QR page ever shows is
 * quietly low with nothing to indicate it.
 *
 * A static test rather than a runtime one because the failure only appears in
 * a real serverless freeze, which no local test can stage. What CAN be checked
 * is that the code does not contain the shape known to lose rows.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const routePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../app/q/[code]/route.ts",
);
const raw = readFileSync(routePath, "utf8");

/**
 * Comments stripped before matching.
 *
 * The first version of this guard failed on its own first run, matching the
 * words "void recordScan" inside the comment that WARNS against them. A guard
 * that reads prose as code is the same defect that made
 * `marketing-support.static.test.ts` redden on a refactor where nothing
 * changed — and it fails in the worse direction here, because it would have
 * forced the explanation to be deleted to make the test pass.
 */
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[^\n]*?\/\/.*$/gm, "");

test("the scan write is deferred with after(), not left floating", () => {
  assert.match(
    src,
    /import\s*\{[^}]*\bafter\b[^}]*\}\s*from\s*"next\/server"/,
    "route.ts must import after() from next/server",
  );
  assert.match(src, /after\(record\)/, "the scan write must be handed to after()");
});

test("recordScan is never called as a bare floating promise", () => {
  // The exact shape that lost rows on production.
  assert.doesNotMatch(
    src,
    /void\s+recordScan\s*\(/,
    "`void recordScan(...)` is fire-and-forget and drops rows when the instance freezes; use after()",
  );
});

test("the guest is not made to wait for the analytics write", () => {
  // The other half of the invariant. Awaiting recordScan before returning
  // would fix the loss and cost a person standing at a table a round trip to
  // the database before they see a menu. after() is what gets both.
  assert.doesNotMatch(
    src,
    /await\s+recordScan\s*\(/,
    "awaiting the scan write puts a database round trip in front of the guest's redirect",
  );
});
