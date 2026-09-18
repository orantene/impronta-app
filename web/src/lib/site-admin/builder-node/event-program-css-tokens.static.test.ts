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
  assert.match(sheet, /@media \(min-width:1024px\)\{[^\n]*data-rail="1"\]\{display:grid;grid-template-columns:180px/);
  assert.match(sheet, /\.ep-time\{[^}]*flex-direction:column/, "the time column is a narrow vertical badge");
  assert.doesNotMatch(sheet, /overflow-x:auto[^\n]*\.ep-list|\.ep-list\{[^}]*overflow-x/, "no horizontal timeline rule");
});

test("editorial run-of-show: one 880px column, the row grid, the rail and dot, no boxes, no hover", () => {
  assert.match(sheet, /\.ep-shell\{[^}]*max-width:880px;margin:0 auto/);
  assert.match(sheet, /\.ep-item\{[^}]*grid-template-columns:64px 20px minmax\(0,1fr\)/, "phone grid: time 64 / rail 20 / content");
  assert.match(sheet, /@media \(min-width:640px\)\{[^\n]*\.ep-item\{grid-template-columns:96px 24px minmax\(0,1fr\)/, "desktop grid: time 96 / rail 24 / content");
  assert.match(sheet, /\.ep-item\[data-image="1"\]\{grid-template-columns:96px 24px minmax\(0,1fr\) 72px\}/, "thumb column only with an image");
  assert.match(sheet, /\.ep-cover\{display:none/, "thumb hidden on phones");
  assert.match(sheet, /--ep-rail:color-mix\(in srgb,var\(--token-color-primary\) 35%,transparent\)/);
  assert.match(sheet, /\.ep-list::before\{[^}]*width:1px;background:var\(--ep-rail\)/, "1px rail");
  assert.match(sheet, /\.ep-dot\{[^}]*width:8px;height:8px[^}]*background:var\(--token-color-primary\)/, "8px primary dot");
  assert.match(sheet, /\[data-now="1"\] \.ep-dot\{box-shadow:0 0 0 6px var\(--ep-glow\)\}/, "current item glow");
  assert.match(sheet, /--ep-glow:color-mix\(in srgb,var\(--token-color-primary\) 18%,transparent\)/);
  assert.match(sheet, /\.ep-item\{[^}]*border-bottom:1px solid var\(--ep-sep\);background:transparent\}/, "separator, no box");
  assert.match(sheet, /--ep-sep:color-mix\(in srgb,var\(--token-color-line\) 40%,transparent\)/);
  assert.match(sheet, /\.ep-time\{[^}]*font-family:var\(--site-heading-font,inherit\);font-size:1\.15rem[^}]*color:var\(--token-color-primary\)[^}]*tabular-nums/);
  assert.match(sheet, /\.ep-title\{[^}]*font-family:var\(--site-heading-font,inherit\)[^}]*font-size:1\.15rem;line-height:1\.2/);
  assert.match(sheet, /\.ep-title\{font-size:1\.3rem\}/, "1.3rem title from 640px");
  assert.match(sheet, /\.ep-meta\{[^}]*font-size:0\.68rem[^}]*letter-spacing:0\.16em;text-transform:uppercase/);
  assert.match(sheet, /\.ep-eyebrow\{[^}]*font-size:0\.7rem[^}]*letter-spacing:0\.24em;text-transform:uppercase;color:var\(--token-color-primary\)/);
  assert.match(sheet, /\.ep-heading\{[^}]*font-size:1\.9rem/);
  assert.match(sheet, /\.ep-heading\{font-size:2\.4rem\}/);
  assert.match(sheet, /\.ep-chip\[data-on="1"\]\{[^}]*background:var\(--token-color-primary\);color:var\(--token-color-primary-on/);
  assert.doesNotMatch(sheet, /\.ep-item[^{]*:hover/, "rows are not interactive: no hover");
  assert.doesNotMatch(sheet, /\.ep-item\{[^}]*border-radius/, "no card box");
  assert.match(sheet, /\.ep-desc\{[^}]*-webkit-line-clamp:3/);
  assert.match(sheet, /\.ep-time-tba\{[^}]*letter-spacing:0\.12em;text-transform:uppercase/);
});

test("no emoji, no glyph fallback, anywhere in the block's copy, sheet or markup", () => {
  const copy = readFileSync(path.join(here, "event-program-copy.ts"), "utf8");
  const model = readFileSync(path.join(here, "event-program-model.ts"), "utf8");
  // Emoji, dingbats, misc symbols, geometric shapes, variation selectors, ZWJ (the ⇒ in a doc comment is not a glyph the page renders).
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
  for (const [name, src] of [["copy", copy], ["css", css], ["island", island], ["model", model]] as const) {
    assert.doesNotMatch(src, emoji, `${name} carries an emoji or symbol glyph`);
  }
  assert.doesNotMatch(island, /kind === "doors" \|\| item\.kind === "close"/, "a kind is never special-cased into a symbol");
  assert.match(island, /const kindLabel = kind \? t\(`kind_\$\{item\.kind\}`\) : null;/, "a kind is a word, only on showKind");
});

test("the wrapper token is scoped to the kind and the renderer emits it", () => {
  assert.match(scope, /"event-program": "event_program"/);
  assert.match(renderer, /className="site-builder-node site-builder-node--event-program"/);
  assert.match(renderer, /options\.dataSources\.linkedEventId/, "the linked event reaches the island");
  assert.match(renderer, /editor=\{options\.contentLocale\?\.editorPreview === true\}/);
});
