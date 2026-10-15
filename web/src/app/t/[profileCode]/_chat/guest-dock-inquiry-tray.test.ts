import assert from "node:assert/strict";
import { test } from "node:test";

import { inquiryTrayVisible } from "./guest-dock-inquiry-tray";

test("the tray shows on every dock tab except the lineup, once something is in the inquiry", () => {
  for (const view of ["home", "chat", "projects"] as const) {
    assert.equal(inquiryTrayVisible({ count: 2, activeView: view, enabled: true }), true);
  }
  assert.equal(inquiryTrayVisible({ count: 2, activeView: "lineup", enabled: true }), false);
});

test("the tray stays hidden for an empty inquiry or a disabled dock", () => {
  assert.equal(inquiryTrayVisible({ count: 0, activeView: "chat", enabled: true }), false);
  assert.equal(inquiryTrayVisible({ count: 3, activeView: "chat", enabled: false }), false);
});
