/**
 * TUL-536 / card 36 — Booking assistant reachable from Mi sitio via chat intent.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

test("website-settings intent accepts chat deep-link", () => {
  const intent = read("src/components/talent/website-settings/website-settings-intent.ts");
  assert.match(intent, /WebsiteSettingsIntentView\s*=\s*"lang"\s*\|\s*"chat"/);
});

test("WebsiteSettingsScreen initialView accepts chat intent type", () => {
  const screen = read("src/components/talent/website-settings/WebsiteSettingsScreen.tsx");
  assert.match(screen, /initialView\?:\s*WebsiteSettingsIntentView/);
  assert.match(screen, /view === "chat"/);
  assert.match(screen, /ChatInquiriesGroup/);
});

test("Mi sitio opens Chat & inquiries with chat intent", () => {
  const editor = read(
    "src/components/admin/shell/internal/talent/pages/PublicPageEditor.tsx",
  );
  assert.match(editor, /openWebsiteSettings\s*=\s*\(view\?:\s*WebsiteSettingsIntentView\)/);
  assert.match(editor, /openWebsiteSettings\("chat"\)/);
  assert.match(editor, /copy\.t\("Chat & inquiries"\)/);
  assert.match(editor, /copy\.t\("Website chat, inquiries and booking assistant"\)/);
  assert.match(editor, /initialView=\{settingsView\}/);
  // Settings tile / home NavRow still open home (no view arg).
  assert.match(editor, /onOpenSettings=\{\(\) => openWebsiteSettings\(\)\}/);
  assert.match(editor, /onOpen=\{\(\) => openWebsiteSettings\(\)\}/);
});
