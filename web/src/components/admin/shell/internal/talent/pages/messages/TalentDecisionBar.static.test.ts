import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The bar renders ABOVE MessagesV5Shell, outside its `.msgv5` scope, and the
// kit's `.btn` styles are scoped `.msgv5 .btn`. Without its own scope the
// Accept/Decline buttons rendered as bare text (QA on Jor, 2026-10-01).
test("TalentDecisionBar carries the msgv5 scope so its Btn styles apply", () => {
  const src = readFileSync(new URL("./TalentDecisionBar.tsx", import.meta.url), "utf8");
  assert.match(src, /data-talent-decision className="msgv5\b/);
});
