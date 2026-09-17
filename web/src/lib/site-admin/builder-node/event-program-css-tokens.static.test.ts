import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * event_program: the sheet reads tenant tokens only (no hex, no parallel
 * palette), every class the island emits owns a rule, the island injects the
 * sheet, every state is attributed on the root, tap targets are 44px, and the
 * timeline is vertical on phones (no horizontal timeline rule anywhere).
 */
const here = path.dirname(new URL(import.meta.url).pathname);
const css = readFileSync(path.join(here, "event-program-css.ts"), "utf8");
const island = readFileSync(path.join(here, "event-program-island.tsx"), "utf8");
const scope = readFileSync(path.join(here, "renderer-css-scope.ts"), "utf8");
const renderer = readFileSync(path.join(here, "render.tsx"), "utf8");

const sheet = css.slice(css.indexOf("export const EP_CSS = `") + "export const EP_CSS = `".length, css.lastIndexOf("`;"));

test("no hex literal; colours are --token-color-* roles", () => {
  assert.doesNotMatch(sheet, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(sheet, /\brgb\(|\bhsl\(/i, "no raw colour functions");
  assert.ok((sheet.match(/--token-color-/g) ?? []).length >= 8);
});

test("every island class has a rule", () => {
  const classes = new Set(Array.from(island.matchAll(/className="(ep-[a-z-]+)"/g)).map((m) => m[1]!));
  assert.ok(classes.size >= 12, `expected the island's classes, got ${classes.size}`);
  for (const cls of classes) assert.match(sheet, new RegExp(`\\.${cls}[^a-z-]`), `${cls} has no rule`);
  assert.match(island, /<style>\{EP_CSS\}<\/style>/);
});

test("every state is attributed on the root with a testid, and the two public-silent ones are hidden", () => {
  for (const s of ["not_configured", "loading", "disabled", "unavailable", "empty", "ready"]) {
    assert.match(island, new RegExp(`"${s}"`), `state ${s} is missing`);
  }
  assert.match(island, /data-event-program=\{state\} data-testid=\{`event-program-\$\{state\}`\}/);
  assert.match(island, /if \(state === "not_configured" \|\| state === "disabled"\) \{\s*\/\/[^\n]*\n\s*if \(!editor\) return chrome\(null, true\);/);
});

test("mobile first: 44px targets, vertical timeline only, sticky chips, desktop rail at 1024", () => {
  assert.match(sheet, /\.ep-chip\{[^}]*min-height:44px/);
  assert.match(sheet, /\.ep-item\{[^}]*min-height:44px/);
  assert.match(sheet, /\.ep-nav\{position:sticky/);
  assert.match(sheet, /@media \(min-width:1024px\)\{[^\n]*data-rail="1"\]\{display:grid;grid-template-columns:200px/);
  assert.match(sheet, /\.ep-time\{[^}]*flex-direction:column/, "the time column is a narrow vertical badge");
  assert.match(sheet, /grid-template-columns:64px 1fr/, "64px time column");
  assert.doesNotMatch(sheet, /overflow-x:auto[^\n]*\.ep-list|\.ep-list\{[^}]*overflow-x/, "no horizontal timeline rule");
});

test("the wrapper token is scoped to the kind and the renderer emits it", () => {
  assert.match(scope, /"event-program": "event_program"/);
  assert.match(renderer, /className="site-builder-node site-builder-node--event-program"/);
  assert.match(renderer, /options\.dataSources\.linkedEventId/, "the linked event reaches the island");
  assert.match(renderer, /editor=\{options\.contentLocale\?\.editorPreview === true\}/);
});
