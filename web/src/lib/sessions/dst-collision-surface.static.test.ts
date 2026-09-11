import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(process.cwd(), "src/components/admin/shell/internal/page-modules/SessionsPage.tsx"),
  "utf8",
);

test("DST collisions are an operator list, not only a log line", () => {
  assert.match(src, /collisions\.map/);
  assert.match(src, /collidesWithTitle/);
  assert.match(src, /dashboard\.adminSessions\.refusals\.collision/);
});
