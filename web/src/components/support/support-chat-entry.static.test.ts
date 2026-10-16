import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// TUL-903/904: "Chat with support" and "Ask a question" opened the
// `support-ticket` drawer with no ticketId, which only renders "This ticket
// could not be loaded." They must open the real support panel instead.
const launcher = readFileSync("src/components/support/SupportLauncher.tsx", "utf8");
const wave2 = readFileSync("src/components/admin/shell/internal/wave2.tsx", "utf8");
const help = readFileSync("src/components/admin/shell/internal/help.tsx", "utf8");
const opener = readFileSync("src/lib/support/open-support-panel.ts", "utf8");

test("the opener dispatches a window event the launcher listens for", () => {
  assert.match(opener, /export const SUPPORT_PANEL_OPEN_EVENT/);
  assert.match(opener, /export function openSupportPanel/);
  assert.match(launcher, /addEventListener\(SUPPORT_PANEL_OPEN_EVENT/);
  assert.match(launcher, /removeEventListener\(SUPPORT_PANEL_OPEN_EVENT/);
});

test("Help drawer 'Chat with support' opens the panel, not a ticketless drawer", () => {
  const i = wave2.indexOf("dashboard.adminWave.chatSupport");
  const block = wave2.slice(i - 400, i);
  assert.match(block, /openSupportPanel\(\)/);
  assert.doesNotMatch(block, /openDrawer\("support-ticket"\)/);
});

test("drawer-footer 'Ask a question' opens the panel, not a ticketless drawer", () => {
  assert.match(help, /openSupportPanel\(\)/);
  assert.doesNotMatch(help, /openDrawer\("support-ticket"/);
});
