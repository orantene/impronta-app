import assert from "node:assert/strict";
import { test } from "node:test";

import { supportRequesterReplyPath } from "./support-reply-path";

test("guest surface never falls through to /talent?support=", () => {
  const path = supportRequesterReplyPath("guest", "11111111-1111-1111-1111-111111111111");
  assert.equal(path.includes("/talent"), false);
  assert.equal(path.includes("support="), false);
  assert.ok(path === "/contact" || path.startsWith("/contact?t="));
});

test("talent / unknown surface still uses /talent?support=", () => {
  assert.equal(
    supportRequesterReplyPath("talent", "tid"),
    "/talent?support=tid",
  );
  assert.equal(supportRequesterReplyPath(null, "tid"), "/talent?support=tid");
});
