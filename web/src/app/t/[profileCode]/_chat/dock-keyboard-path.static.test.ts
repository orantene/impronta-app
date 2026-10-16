import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const launcher = readFileSync(join(__dirname, "TalentProfileChatLauncher.tsx"), "utf8");
const panel = readFileSync(join(__dirname, "MiniChatPanel.tsx"), "utf8");

test("TUL-1082: launcher is a real, labelled, focusable button", () => {
  assert.match(launcher, /ref=\{pillRef\}\s*\n\s*type="button"/);
  assert.match(launcher, /aria-expanded=\{open\}/);
});

test("TUL-1082: Esc closes the dock", () => {
  assert.match(panel, /e\.key === "Escape" && onClose\(\)/);
});

test("TUL-1082: focus moves into the dock on open (desktop composer)", () => {
  assert.match(panel, /textareaRef\.current\?\.focus\(\)/);
});

test("TUL-1082: focus returns to the launcher after close", () => {
  assert.match(launcher, /wasOpenRef\.current && !open/);
  assert.match(launcher, /pillRef\.current\?\.focus\(\)/);
});
