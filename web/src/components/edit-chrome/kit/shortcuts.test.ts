import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterVisibleShortcuts,
  isShortcutVisible,
  SHORTCUTS,
} from "./shortcuts";

test("isShortcutVisible hides theme shortcut when site shell is locked", () => {
  assert.equal(
    isShortcutVisible("open-theme", {
      canEditSiteShell: false,
      homepageEditing: true,
    }),
    false,
  );
  assert.equal(
    isShortcutVisible("open-theme", {
      canEditSiteShell: true,
      homepageEditing: true,
    }),
    true,
  );
});

test("isShortcutVisible hides revisions shortcut off the homepage editor", () => {
  assert.equal(
    isShortcutVisible("open-revisions", {
      canEditSiteShell: true,
      homepageEditing: false,
    }),
    false,
  );
  assert.equal(
    isShortcutVisible("open-revisions", {
      canEditSiteShell: true,
      homepageEditing: true,
    }),
    true,
  );
});

test("filterVisibleShortcuts keeps all shortcuts when shell editing is enabled", () => {
  const visible = filterVisibleShortcuts(SHORTCUTS, {
    canEditSiteShell: true,
    homepageEditing: true,
  });
  assert.equal(visible.length, SHORTCUTS.length);
  assert.ok(visible.some((entry) => entry.id === "open-theme"));
});

test("filterVisibleShortcuts removes theme shortcut when shell editing is disabled", () => {
  const visible = filterVisibleShortcuts(SHORTCUTS, {
    canEditSiteShell: false,
    homepageEditing: true,
  });
  assert.ok(visible.length < SHORTCUTS.length);
  assert.equal(visible.some((entry) => entry.id === "open-theme"), false);
  assert.ok(visible.some((entry) => entry.id === "open-assets"));
});

test("filterVisibleShortcuts removes revisions shortcut when not homepage editing", () => {
  const visible = filterVisibleShortcuts(SHORTCUTS, {
    canEditSiteShell: true,
    homepageEditing: false,
  });
  assert.equal(visible.some((entry) => entry.id === "open-revisions"), false);
  assert.ok(visible.some((entry) => entry.id === "open-publish"));
});
