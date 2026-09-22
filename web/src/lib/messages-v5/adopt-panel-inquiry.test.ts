import assert from "node:assert/strict";
import { test } from "node:test";

import { inquiryIdAfterUnifiedSync } from "./adopt-panel-inquiry";

test("a Book again switch is not overwritten by the unified hook's previous id", () => {
  assert.equal(inquiryIdAfterUnifiedSync("new-inquiry", "old-inquiry"), "new-inquiry");
});

test("a panel with no inquiry yet adopts the hook's lazy id", () => {
  assert.equal(inquiryIdAfterUnifiedSync(null, "created"), "created");
  assert.equal(inquiryIdAfterUnifiedSync(null, null), null);
});
