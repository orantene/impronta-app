import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Sessions tab of Appointments & Classes (board W39) is where the
// materialiser's refusals are shown, above the table of dated sessions.
const src = readFileSync(
  join(process.cwd(), "src/components/admin/shell/internal/page-modules/SessionsTable.tsx"),
  "utf8",
);

test("DST collisions are an operator list, not only a log line", () => {
  assert.match(src, /collisions\.map/);
  assert.match(src, /collidesWithTitle/);
  assert.match(src, /dashboard\.adminSessions\.refusals\.collision/);
});
