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

const hook = readFileSync(join(__dirname, "use-dock-focus-return.ts"), "utf8");

test("TUL-1082: focus moves into the dock on open (desktop composer, else the dialog itself)", () => {
  assert.match(panel, /focusIntoDock\(phone, textareaRef\.current\)/);
  assert.match(hook, /if \(!phone\) composer\?\.focus\(\)/);
  assert.match(hook, /panel\.focus\(\{ preventScroll: true \}\)/);
  assert.match(panel, /data-guest-chat-panel=""\s*\n\s*tabIndex=\{-1\}/);
});

test("TUL-1082: focus returns to the control that opened the dock, the launcher, or a visible chat opener", () => {
  assert.match(launcher, /useDockFocusReturn\(open, pillRef\)/);
  assert.match(hook, /wasOpenRef\.current && !open/);
  assert.match(hook, /\[openerRef\.current, pillRef\.current, \.\.\.Array\.from\(document\.querySelectorAll<HTMLElement>\(CHAT_OPENER_SELECTOR\)\)\]/);
  assert.match(hook, /document\.addEventListener\("focusin", onFocusIn\)/);
});
