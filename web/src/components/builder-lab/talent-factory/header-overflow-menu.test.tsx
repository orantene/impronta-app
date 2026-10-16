import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HeaderOverflowMenu } from "./header-overflow-menu";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MENU = read("src/components/builder-lab/talent-factory/header-overflow-menu.tsx");
const MOUNT = read("src/components/builder-lab/talent-factory/theme-template-editor-mount.tsx");
const TOPBAR = read("src/components/edit-chrome/topbar.tsx");

describe("TUL-1001: the Builder Lab ⋯ menu is not clipped by the top bar", () => {
  it("the editor header uses the portal menu, not an absolute <details> dropdown", () => {
    assert.match(MOUNT, /<HeaderOverflowMenu label=\{t\.more\}>/);
    assert.doesNotMatch(MOUNT, /<details[^>]*data-header-overflow/);
    assert.doesNotMatch(MOUNT, /absolute right-0 z-50 mt-1/);
  });

  it("the cause is still there, which is why the panel must leave the bar: the top bar clips vertically", () => {
    assert.match(TOPBAR, /fixed inset-x-0 top-0 z-\[90\] overflow-x-auto overflow-y-hidden/);
  });

  it("the panel is portalled to <body>, fixed-positioned from the button, and kept mounted while closed", () => {
    assert.match(MENU, /createPortal\(/);
    assert.match(MENU, /document\.body/);
    assert.match(MENU, /fixed z-\[200\]/);
    assert.match(MENU, /getBoundingClientRect\(\)/);
    assert.match(MENU, /hidden=\{!open\}/, "children own state (Save as new design), so the panel must not unmount on close");
    assert.doesNotMatch(MENU, /\{open \? createPortal/);
  });

  it("keyboard and focus: Escape closes and returns focus; outside click closes; aria state is exposed", () => {
    assert.match(MENU, /e\.key === "Escape"/);
    assert.match(MENU, /buttonRef\.current\?\.focus\(\)/);
    assert.match(MENU, /document\.addEventListener\("pointerdown"/);
    assert.match(MENU, /aria-expanded=\{open\}/);
    assert.match(MENU, /aria-controls=\{panelId\}/);
  });

  it("a click inside a dialog opened from the panel (portalled elsewhere) does not close the menu", () => {
    assert.match(MENU, /closest\("\[role='dialog'\]"\)/);
  });

  it("server render: just the labelled button, closed, with no panel yet", () => {
    const html = renderToStaticMarkup(<HeaderOverflowMenu label="Más acciones"><span>child</span></HeaderOverflowMenu>);
    assert.match(html, /aria-label="Más acciones"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /data-header-overflow/);
    assert.doesNotMatch(html, /child/, "the panel is portalled after mount, never part of the server markup");
  });
});
