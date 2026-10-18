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

test("TUL-1082: focus returns to the control that opened the dock, the launcher, or a visible chat opener", () => {
  assert.match(launcher, /wasOpenRef\.current && !open/);
  // the opener (catalog bar / selection dock chat button) first, then the launcher, then any visible opener
  assert.match(launcher, /openerRef\.current,\s*\n\s*pillRef\.current,\s*\n\s*\.\.\.Array\.from\(document\.querySelectorAll<HTMLElement>\(CHAT_OPENER_SELECTOR\)\)/);
  assert.match(launcher, /document\.addEventListener\("focusin", onFocusIn\)/);
});

test("TUL-1082: focus always moves into the dock on open (composer on desktop, the dialog itself otherwise)", () => {
  assert.match(panel, /panel\.focus\(\{ preventScroll: true \}\)/);
  assert.match(panel, /data-guest-chat-panel=""\s*\n\s*tabIndex=\{-1\}/);
});
