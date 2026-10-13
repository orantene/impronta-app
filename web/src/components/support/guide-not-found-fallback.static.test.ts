import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(join(process.cwd(), "src/components/support/GuideTab.tsx"), "utf8");

test("a missing Guide article falls back to the home and never prints the id", () => {
  assert.match(src, /if \(!a\) setOpenNodeId\(null\)/);
  assert.ok(!src.includes("guideNotFound"));
  for (const l of ["en", "es"]) {
    assert.ok(!readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8").includes("guideNotFound"));
  }
});
