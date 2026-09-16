import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * The menu board was born class-name-only: ~20 `site-builder-node--menu-board-*`
 * classes and not one rule anywhere, so a live restaurant rendered a raw list
 * with a "-0+" stepper. Every class the island or the renderer emits must own
 * a rule, the rules must read tokens (no hex), and the operator's authored
 * block style must reach the section instead of being discarded.
 */
const here = path.dirname(new URL(import.meta.url).pathname);
const island = readFileSync(path.join(here, "menu-board-island.tsx"), "utf8");
const renderer = readFileSync(path.join(here, "render.tsx"), "utf8");
const scope = readFileSync(path.join(here, "renderer-css-scope.ts"), "utf8");

const islandCss = island.slice(island.indexOf("const MB_CSS = `"), island.indexOf("`;", island.indexOf("const MB_CSS = `")));
const menuCase = renderer.slice(renderer.indexOf('case "menu_board": {'), renderer.indexOf("<MenuBoardIsland"));
const rendererCss = renderer.slice(renderer.indexOf("const BUILDER_NODE_RENDERER_CSS = `"), renderer.indexOf("`;", renderer.indexOf("const BUILDER_NODE_RENDERER_CSS = `")));

function classesIn(src: string): string[] {
  const jsx = src.replace(/const MB_CSS = `[\s\S]*?`;/, "");
  return Array.from(new Set(Array.from(jsx.matchAll(/site-builder-node--menu-board-[a-z-]+/g)).map((m) => m[0])));
}

test("every island class has a rule in MB_CSS", () => {
  const classes = classesIn(island);
  assert.ok(classes.length >= 15, `expected the island's class list, got ${classes.length}`);
  for (const cls of classes) assert.match(islandCss, new RegExp(`\\.${cls}[^a-z-]`), `${cls} has no rule`);
  assert.match(island, /<style>\{MB_CSS\}<\/style>/);
});

test("every server-half class has a rule in the renderer sheet and a scope entry", () => {
  for (const cls of classesIn(menuCase)) {
    assert.match(rendererCss, new RegExp(`\\.${cls}[^a-z-]`), `${cls} has no rule`);
    const token = cls.replace("site-builder-node--", "");
    assert.match(scope, new RegExp(`"${token}": "menu_board"`), `${token} not scoped to menu_board`);
  }
});

test("no hex literal in either sheet; colours come from tokens", () => {
  for (const sheet of [islandCss, rendererCss.slice(rendererCss.indexOf(".site-builder-node--menu-board{"), rendererCss.indexOf(".site-builder-node--menu-board-catnav a"))]) {
    assert.doesNotMatch(sheet, /#[0-9a-f]{3,8}\b/i);
  }
});

test("the authored block style reaches both sections", () => {
  assert.doesNotMatch(menuCase, /builderNodeStyleAttrs\(undefined\)/);
  assert.equal((menuCase.match(/builderNodeStyleAttrs\(p\.style\)/g) ?? []).length, 2);
  assert.equal((menuCase.match(/style=\{inlineNodeStyle\(p\.style, undefined\)\}/g) ?? []).length, 2);
});

test("the duplicate server list is hidden only once the island is live", () => {
  assert.match(rendererCss, /\[data-menu-board-live="1"\] \.site-builder-node--menu-board-list\{position:absolute/);
  assert.match(island, /setAttribute\("data-menu-board-live", "1"\)/);
  assert.doesNotMatch(island, /style=\{\{/, "no inline style objects; the sheet carries the look");
});
