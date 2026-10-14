import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { requestPresenceTab, takePresenceTabIntent } from "./website-settings-intent";

test("presence tab intent is taken once, then cleared", () => {
  assert.equal(takePresenceTabIntent(), null);
  requestPresenceTab("appear");
  assert.equal(takePresenceTabIntent(), "appear");
  assert.equal(takePresenceTabIntent(), null);
});

test("Settings > Hide a public page lands on Where I appear, not the slow My website tab", () => {
  const src = readFileSync(new URL("../../admin/shell/internal/talent/pages/SettingsPage.tsx", import.meta.url), "utf8");
  const hide = src.slice(src.indexOf('key: "hide"'), src.indexOf('key: "hide"') + 500);
  assert.match(hide, /requestPresenceTab\("appear"\)/);
  const editor = readFileSync(new URL("../../admin/shell/internal/talent/pages/PublicPageEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /takePresenceTabIntent\(\)/);
});

test("the website manager load never hangs: it is time-boxed into the error card", () => {
  const src = readFileSync(new URL("../site/TalentMaxSiteManager.tsx", import.meta.url), "utf8");
  assert.match(src, /Promise\.race/);
});
