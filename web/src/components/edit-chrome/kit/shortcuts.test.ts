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

test("isShortcutVisible keeps revisions visible off the homepage editor", () => {
  assert.equal(
    isShortcutVisible("open-revisions", {
      canEditSiteShell: true,
      homepageEditing: false,
    }),
    true,
  );
});

test("shortcut key sequences are unique", () => {
  const seen = new Map<string, string>();
  for (const entry of SHORTCUTS) {
    if (entry.keys.length === 0) continue;
    const chord = entry.keys.join("+");
    const prior = seen.get(chord);
    assert.equal(
      prior,
      undefined,
      `chord ${chord} claimed by both ${prior} and ${entry.id}`,
    );
    seen.set(chord, entry.id);
  }
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

test("filterVisibleShortcuts keeps revisions when not homepage editing", () => {
  const visible = filterVisibleShortcuts(SHORTCUTS, {
    canEditSiteShell: true,
    homepageEditing: false,
  });
  assert.ok(visible.some((entry) => entry.id === "open-revisions"));
  assert.ok(visible.some((entry) => entry.id === "open-publish"));
});

test("shortcut registry includes builder keyboard editing coverage", () => {
  const ids = new Set(SHORTCUTS.map((entry) => entry.id));
  for (const id of [
    "copy-block",
    "cut-block",
    "paste-block",
    "duplicate-section",
    "delete-section",
    "nudge-block",
    "select-parent-block",
    "select-child-block",
    "shortcut-overlay",
  ]) {
    assert.ok(ids.has(id), `${id} should be discoverable`);
  }
});
