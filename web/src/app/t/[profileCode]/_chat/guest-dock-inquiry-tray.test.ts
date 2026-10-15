import assert from "node:assert/strict";
import { test } from "node:test";

import { inquiryTrayVisible } from "./guest-dock-inquiry-tray";

test("the tray shows on every dock tab, once something is in the inquiry", () => {
  for (const view of ["home", "chat", "projects", "lineup"] as const) {
    assert.equal(inquiryTrayVisible({ count: 2, activeView: view, enabled: true }), true);
  }
});

test("the tray stays hidden for an empty inquiry or a disabled dock", () => {
  assert.equal(inquiryTrayVisible({ count: 0, activeView: "chat", enabled: true }), false);
  assert.equal(inquiryTrayVisible({ count: 3, activeView: "chat", enabled: false }), false);
});
