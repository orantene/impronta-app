/**
 * Empty first visit: no Home tab, a zero count draws no badge, a draft
 * says draft, and Send is absent until an inquiry row exists.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));

test("the dock has no Home tab and hides a zero count", () => {
  const nav = readFileSync(join(DIR, "GuestDockNav.tsx"), "utf8");
  assert.equal(nav.includes('view: "home"'), false);
  assert.match(nav, /count > 0/);
});

test("a draft status says draft", () => {
  const styles = readFileSync(join(DIR, "mini-chat-styles.ts"), "utf8");
  assert.match(styles, /draft: "public\.guestChat\.statusDraft"/);
});

test("Send stays hidden until an inquiry exists", () => {
  const panel = readFileSync(join(DIR, "MiniChatPanel.tsx"), "utf8");
  assert.match(panel, /onEnsureInquiry && inquiryId && !unified\.contactPromoted/);
});
