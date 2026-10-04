/**
 * Front-door v27 Phone sheet: match mockup
 * (`docs/design/front-door-brief.html` body.phone .panel) and lift the
 * composer above the soft keyboard only via the Visual Viewport API.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPACT_SHEET_MAX_WIDTH,
  COMPACT_SHEET_RADIUS,
  COMPACT_SHEET_TOP,
  miniPanelContainerStyle,
} from "./mini-chat-panel-geometry";
import { C } from "./mini-chat-styles";

const dir = dirname(fileURLToPath(import.meta.url));

test("exposes the mockup Phone sheet tokens", () => {
  assert.equal(COMPACT_SHEET_TOP, "8vh");
  assert.equal(COMPACT_SHEET_MAX_WIDTH, "min(420px, 100%)");
  assert.equal(COMPACT_SHEET_RADIUS, "20px 20px 0 0");
});

test("builds a fixed sheet from 8vh to the bottom when the keyboard is closed", () => {
  const style = miniPanelContainerStyle(C, true, 0);
  assert.equal(style.position, "fixed");
  assert.equal(style.top, "8vh");
  assert.equal(style.bottom, "env(safe-area-inset-bottom)");
  assert.equal(style.width, "min(420px, 100%)");
  assert.equal(style.borderRadius, "20px 20px 0 0");
  assert.equal(style.height, "auto");
});

test("lifts bottom to the Visual Viewport inset when the keyboard is open", () => {
  const style = miniPanelContainerStyle(C, true, 280);
  assert.equal(style.bottom, "280px");
  assert.equal(style.top, "8vh");
});

test("leaves desktop geometry untouched by the keyboard inset", () => {
  const closed = miniPanelContainerStyle(C, false, 0);
  const open = miniPanelContainerStyle(C, false, 280);
  assert.equal(open.bottom, closed.bottom);
  assert.equal(open.top, closed.top);
});

test("wires Visual Viewport into MiniChatPanel and keeps the hook source clean", () => {
  const panel = readFileSync(join(dir, "MiniChatPanel.tsx"), "utf8");
  assert.match(panel, /useVisualViewportInset/);
  assert.match(panel, /miniPanelContainerStyle\(P, compactSheet, keyboardInsetPx\)/);

  const hook = readFileSync(join(dir, "use-visual-viewport-inset.ts"), "utf8");
  assert.match(hook, /visualViewport/);
  assert.doesNotMatch(hook, /keyboardHeight\s*=\s*\d+/);
  assert.match(hook, /innerHeight\s*-\s*vv\.height\s*-\s*vv\.offsetTop/);
});
