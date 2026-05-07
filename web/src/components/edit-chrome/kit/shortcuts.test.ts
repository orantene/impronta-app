import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterVisibleShortcuts,
  isShortcutVisible,
  SHORTCUTS,
} from "./shortcuts";

test("isShortcutVisible hides theme shortcut when site shell is locked", () => {
  assert.equal(
    isShortcutVisible("open-theme", { canEditSiteShell: false }),
    false,
  );
  assert.equal(
    isShortcutVisible("open-theme", { canEditSiteShell: true }),
    true,
  );
});

test("filterVisibleShortcuts keeps all shortcuts when shell editing is enabled", () => {
  const visible = filterVisibleShortcuts(SHORTCUTS, {
    canEditSiteShell: true,
  });
  assert.equal(visible.length, SHORTCUTS.length);
  assert.ok(visible.some((entry) => entry.id === "open-theme"));
});

test("filterVisibleShortcuts removes theme shortcut when shell editing is disabled", () => {
  const visible = filterVisibleShortcuts(SHORTCUTS, {
    canEditSiteShell: false,
  });
  assert.ok(visible.length < SHORTCUTS.length);
  assert.equal(visible.some((entry) => entry.id === "open-theme"), false);
  assert.ok(visible.some((entry) => entry.id === "open-assets"));
});
