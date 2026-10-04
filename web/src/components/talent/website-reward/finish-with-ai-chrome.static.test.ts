/**
 * W21 — Finish with AI chrome must not use large black chat bubbles.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PANEL = readFileSync(
  join(process.cwd(), "src/components/talent/website-reward/FinishWithAiPanel.tsx"),
  "utf8",
);

test("Finish with AI assistant text is plain — no dark bubble classes", () => {
  assert.match(PANEL, /data-testid="finish-with-ai-assistant"/);
  assert.match(PANEL, /data-finish-with-ai-chrome="1"/);
  // Forbidden dark chat-bubble patterns on the assistant / user chrome.
  assert.equal(/bg-black(?!\/25)/.test(PANEL), false);
  assert.equal(/bg-\[#0/.test(PANEL), false);
  assert.equal(/bg-zinc-9/.test(PANEL), false);
  assert.equal(/bg-neutral-9/.test(PANEL), false);
  assert.equal(/ChatBubble/.test(PANEL), false);
  // User bubble uses sunk2 / surface-alt, not ink-on-black.
  assert.match(PANEL, /finish-with-ai-user-bubble/);
  assert.match(PANEL, /color-admin-surface-alt|#F2F2EE/);
  assert.match(PANEL, /Intro · public/);
  assert.match(PANEL, /Use this intro/);
});
