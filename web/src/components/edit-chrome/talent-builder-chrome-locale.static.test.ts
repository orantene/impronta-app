import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { editorT } from "./editor-i18n";

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

test("F88: the bare talent builder provides the server dashboard locale and the editor reads it", () => {
  assert.match(read("components/talent/site/TalentPageBuilderScreen.tsx"), /<DashboardLocaleProvider locale=/);
  const hook = read("components/edit-chrome/use-editor-locale.ts");
  assert.match(hook, /useServerDashboardLocale\(\)/);
  assert.match(hook, /serverLocale === "es"/);
});

test("TUL-459: editor chrome does not re-read the locale cookie when the server locale is present", () => {
  const hook = read("components/edit-chrome/use-editor-locale.ts");
  assert.match(hook, /resolveEditorLocale/);
  assert.match(hook, /if \(hasServerLocale\) return/);
  assert.match(hook, /readLocaleCookie/);
  // Must not unconditionally setLocale from the cookie (the F88 dual-source bug).
  assert.doesNotMatch(hook, /setLocale\(cookieLocale\)/);
  assert.doesNotMatch(hook, /document\.cookie\.match/);
});

test("F88: topbar, health panel, zoom HUD and tip wrap their copy in t()", () => {
  const top = read("components/edit-chrome/topbar.tsx");
  for (const k of ["Publish options", "Exit to live site", "Draft saved", "Publish"]) {
    assert.ok(top.includes(`t("${k}")`), `topbar t("${k}")`);
  }
  const mh = read("components/edit-chrome/MobileHealthPanel.tsx");
  assert.ok(mh.includes('t("Mobile health")') && mh.includes('t("All clear")'));
  assert.ok(read("components/edit-chrome/canvas-viewport.tsx").includes('t("Canvas zoom controls")'));
  assert.ok(read("components/edit-chrome/edit-shell.tsx").includes('t("Click any section to edit'));
  assert.ok(read("components/edit-chrome/topbar-icon-button.tsx").includes("t(title)"));
});

test("F88: every newly wrapped key resolves to Spanish", () => {
  for (const k of [
    "Draft saved",
    "Publish",
    "Publish options",
    "Exit to live site",
    "Mobile health",
    "All clear",
    "Canvas zoom controls",
    "Zoom in (⌘+)",
    "Click any section to edit · Press ⌘K for quick actions",
    "{n}m ago",
  ]) {
    assert.notEqual(editorT(k, "es"), k, k);
    assert.equal(editorT(k, "en"), k);
  }
  assert.equal(editorT("Publish", "es"), "Publicar");
  assert.equal(editorT("Mobile health", "es"), "Salud en móvil");
});

test("TUL-519: mobile/tablet HUD structure hint and phone-menu card resolve in Spanish", () => {
  const panel = read("components/edit-chrome/mobile-edit-panel.tsx");
  assert.match(panel, /useEditorLocale/);
  assert.match(panel, /on the canvas to hide it on \{device\}/);
  assert.match(panel, /device tablet|device mobile/);
  const hud = read("components/edit-chrome/mobile-hud-cards.tsx");
  assert.match(hud, /t\("Phone menu"\)/);
  assert.match(hud, /t\("Open on canvas"\)/);
  for (const k of [
    "on the canvas to hide it on {device} or change its {device} order. Style edits already apply to this breakpoint.",
    "device tablet",
    "device mobile",
    "Phone menu",
    "Open on canvas",
    "{count} link",
    "{count} links",
  ] as const) {
    assert.notEqual(editorT(k, "es"), k, k);
    assert.equal(editorT(k, "en"), k);
  }
});
