import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/server-actions/load-talent-profile-editor-data.ts"),
  "utf8",
);

test("talent self profile hydration uses the self-owned editor data loader", () => {
  assert.match(SRC, /getTalentProfileEditorDataForSelf/);
  assert.match(
    SRC,
    /isSelf\s*\?\s*getTalentProfileEditorDataForSelf\(\{[\s\S]*?talent_profile_id:\s*talentProfileId[\s\S]*?\}\)\s*:\s*getTalentProfileEditorData/,
  );
});
