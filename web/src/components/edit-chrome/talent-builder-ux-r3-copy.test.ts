import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ES_TEXT as ES_TALENT_CHROME_TEXT } from "./editor-i18n-es";

// F123 + F121 copy: conflict, presence and inspector strings exist in Spanish
// and the technical wording is gone from the conflict toast.

const EN_KEYS = [
  "This page changed in another tab. Your last change was not saved.",
  "You have this page open in another tab. Edits there can conflict.",
  "You have this page open in {n} other tabs. Edits there can conflict.",
  "Loads the newest version. Your last change is dropped and undo starts over.",
  "Saves this copy over the other tab. Undo keeps working.",
  "This section",
  "Container",
  "Wrapping",
  "Gap",
];

test("talent builder R3 strings have Spanish", () => {
  for (const key of EN_KEYS) assert.ok(ES_TALENT_CHROME_TEXT[key], key);
  assert.equal(
    ES_TALENT_CHROME_TEXT["This page changed in another tab. Your last change was not saved."],
    "Esta página cambió en otra pestaña. Tu último cambio no se guardó.",
  );
});

test("conflict toast no longer shows the VERSION CONFLICT code or undo-reset jargon", () => {
  const src = readFileSync(join(__dirname, "edit-shell.tsx"), "utf8");
  // The headline (operation label) is hidden on a conflict; the plain reason comes from describeMutationError.
  assert.match(src, /isConflict \? null : \(/);
  assert.match(src, /described\.headline/);
  assert.doesNotMatch(src, /Your unsaved local changes are discarded and undo history resets/);
});

test("saved-state chip and presence banner go through t()", () => {
  const top = readFileSync(join(__dirname, "topbar.tsx"), "utf8");
  assert.match(top, /t\("Save conflict"\)/);
  const shell = readFileSync(join(__dirname, "edit-shell.tsx"), "utf8");
  assert.doesNotMatch(shell, /edits there can conflict`/);
});

test("talent layout panel hides raw flex/grid controls behind Advanced", () => {
  const panel = readFileSync(join(__dirname, "inspectors/layout-panel.tsx"), "utf8");
  assert.match(panel, /<TalentAdvancedGroup/);
  assert.match(panel, /isTalentSurface/);
  const group = readFileSync(
    join(__dirname, "inspectors/layout-panel/talent-advanced-group.tsx"),
    "utf8",
  );
  assert.match(group, /talent_page/);
  assert.match(group, /<details data-builder-layout-advanced/);
  assert.match(group, /sectionLabel\(/);
});

test("undo-reset toast is plain and translated at display", () => {
  const ctx = readFileSync(join(__dirname, "edit-context.tsx"), "utf8");
  assert.match(ctx, /We loaded the latest version\. Undo history started fresh\./);
  assert.doesNotMatch(ctx, /Undo history was reset/);
  const shell = readFileSync(join(__dirname, "edit-shell.tsx"), "utf8");
  assert.match(shell, /describeMutationError\(\{/);
  assert.match(shell, /described\.reason/);
  assert.equal(
    ES_TALENT_CHROME_TEXT["We loaded the latest version. Undo history started fresh."],
    "Cargamos la versión más reciente. El historial de deshacer empezó de nuevo.",
  );
});
