import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("TUL-946: /admin paints a skeleton while the resolver redirect runs", () => {
  const src = readFileSync("src/app/admin/loading.tsx", "utf8");
  assert.match(src, /TalentShellSkeleton/);
  assert.match(src, /export default function/);
});
