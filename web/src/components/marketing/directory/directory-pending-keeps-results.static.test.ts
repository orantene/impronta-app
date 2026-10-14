import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = readFileSync(
  join(process.cwd(), "src/components/marketing/directory/MarketingDirectoryShell.tsx"),
  "utf8",
);

test("TUL-737: a pending search keeps current results on screen instead of a skeleton", () => {
  // Skeleton only when there is nothing to show yet.
  assert.match(src, /isPending && items\.length === 0 \?\s*\(\s*<DirectorySkeleton/);
  assert.doesNotMatch(src, /\) : isPending \? \(\s*<DirectorySkeleton/);
});

test("TUL-737: pending results are dimmed, not replaced", () => {
  assert.match(src, /isPending && items\.length > 0/);
});
