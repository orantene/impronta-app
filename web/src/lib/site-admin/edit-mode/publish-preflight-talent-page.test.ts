import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/site-admin/edit-mode/publish-preflight-action.ts"),
  "utf8",
);

test("talent_page preflight does not require an agency workspace", () => {
  assert.match(SRC, /runTalentPagePublishPreflight/);
  assert.match(SRC, /surfaceKind === "talent_page"/);
  assert.match(
    SRC,
    /if \(!scope\) \{[\s\S]*talent_page[\s\S]*runTalentPagePublishPreflight/,
  );
});
