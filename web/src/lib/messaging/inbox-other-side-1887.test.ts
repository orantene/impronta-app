import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/lib/messaging/inbox.ts"), "utf8");

test("TUL-1887: a blank contact name falls back to the other side before the row reads as a visitor", () => {
  assert.match(src, /loadOtherSideNames\(admin, inquiries, input\.actorUserId\)/);
  assert.match(src, /otherSide\.get\(row\.id\)/);
  // The client's own view names the row by the lineup talent; staff/talent view by the client's account name.
  assert.match(src, /viewerIsClient/);
  assert.match(src, /from\("inquiry_participants"\)/);
  assert.match(src, /from\("profiles"\)\.select\("id, display_name"\)/);
});
