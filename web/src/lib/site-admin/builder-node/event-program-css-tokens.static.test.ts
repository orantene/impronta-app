import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { EP_CSS } from "./event-program-css";

/**
 * event_program: the sheets read tenant tokens only (no hex, no parallel
 * palette), every class the island or a layout emits owns a rule, the island
 * injects the sheet, every state is attributed on the root, tap targets are
 * 44px, the timeline is vertical on phones, all five layouts share the design
 * language, and nothing carries an emoji or a glyph.
 */
const here = path.dirname(new URL(import.meta.url).pathname);
const read = (name: string) => readFileSync(path.join(here, name), "utf8");
const island = read("event-program-island.tsx");
const layouts = read("event-program-layouts.tsx");
const drawer = read("event-program-drawer.tsx");
const scope = read("renderer-css-scope.ts");
const renderer = read("render.tsx");
const sheet = EP_CSS;

test("no hex literal; colours are --token-color-* roles; type is the site font tokens", () => {
  assert.doesNotMatch(sheet, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(sheet, /\brgb\(|\bhsl\(/i, "no raw colour functions");
  assert.ok((sheet.match(/--token-color-/g) ?? []).length >= 20);
  assert.doesNotMatch(sheet, /font-family:(?!var\(--site-(heading|body)-font|inherit)/, "type comes from --site-heading-font / --site-body-font only");
});

test("every class the island or a layout emits has a rule", () => {
  const classes = new Set<string>();
  for (const src of [island, layouts, drawer]) {
    for (const m of src.matchAll(/className="([^"]+)"/g)) for (const cls of m[1]!.split(/\s+/)) if (cls.startsWith("ep-")) classes.add(cls);
  }
  assert.ok(classes.size >= 40, `expected the block's classes, got ${classes.size}`);
  for (const cls of classes) assert.match(sheet, new RegExp(`\\.${cls}[^a-z0-9-]`), `${cls} has no rule`);
  assert.match(island, /<style>\{EP_CSS\}<\/style>/);
});

test("every state is attributed on the root with a testid and the layout; the two public-silent ones are hidden", () => {
  for (const s of ["not_configured", "loading", "disabled", "unavailable", "empty", "ready"]) {
    assert.match(island, new RegExp(`"${s}"`), `state ${s} is missing`);
  }
  assert.match(island, /data-event-program=\{state\} data-testid=\{`event-program-\$\{state\}`\} data-layout=\{lay\}/);
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

test("timeline: one 880px column, the row grid, the rail and dot, thumbs only with an image, no boxes, no hover", () => {
  assert.match(sheet, /\.ep-shell\{[^}]*max-width:880px;margin:0 auto/);
  assert.match(sheet, /\.ep-item\{[^}]*grid-template-columns:64px 20px minmax\(0,1fr\)/, "phone grid: time 64 / rail 20 / content");
  assert.match(sheet, /\.ep-item\[data-image="1"\]\{grid-template-columns:64px 20px minmax\(0,1fr\) 56px\}/, "phone: 56px square at the right edge, only with an image");
  assert.match(sheet, /\.ep-cover\{display:block;grid-column:4;width:56px;height:56px[^}]*border-radius:8px/);
  assert.match(sheet, /@media \(min-width:640px\)\{[^\n]*\.ep-item\{grid-template-columns:96px 24px minmax\(0,1fr\)/, "desktop grid: time 96 / rail 24 / content");
  assert.match(sheet, /\.ep-item\[data-image="1"\]\{grid-template-columns:96px 24px minmax\(0,1fr\) 72px\}/, "72px thumb column only with an image");
  assert.match(sheet, /\.ep-cover\{width:72px;height:auto;aspect-ratio:4\/5\}/, "4:5 cover from 640px");
  assert.match(sheet, /--ep-rail:color-mix\(in srgb,var\(--token-color-primary\) 35%,transparent\)/);
  assert.match(sheet, /\[data-layout="timeline"\] \.ep-list::before\{[^}]*width:1px;background:var\(--ep-rail\)/, "1px rail");
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
  assert.doesNotMatch(sheet, /\.ep-(item|card|line|tile|block)[^{]*:hover/, "rows are not interactive: no hover");
  assert.doesNotMatch(sheet, /\.ep-item\{[^}]*border-radius/, "no card box on a timeline row");
  assert.match(sheet, /\.ep-desc\{[^}]*-webkit-line-clamp:3/);
  assert.match(sheet, /\.ep-time-tba\{[^}]*letter-spacing:0\.12em;text-transform:uppercase/);
});

test("cards: 1 → 2 → 3 grid, 16:10 cover or surface panel with the time, hairline border, radius 12, no shadow", () => {
  assert.match(sheet, /\.ep-cards\{[^}]*grid-template-columns:1fr/);
  assert.match(sheet, /@media \(min-width:640px\)\{\[data-event-program\] \.ep-cards\{grid-template-columns:repeat\(2,/);
  assert.match(sheet, /@media \(min-width:1024px\)\{\[data-event-program\] \.ep-cards\{grid-template-columns:repeat\(3,/);
  assert.match(sheet, /\.ep-card\{[^}]*border:1px solid var\(--ep-sep\);border-radius:12px/);
  assert.doesNotMatch(sheet, /\.ep-card\{[^}]*box-shadow/);
  assert.match(sheet, /\.ep-card-cover\{[^}]*aspect-ratio:16\/10/);
  assert.match(sheet, /\.ep-card-panel\{[^}]*aspect-ratio:16\/10;background:var\(--ep-surface\)/);
  assert.match(sheet, /\.ep-card-panel-time\{font-family:var\(--site-heading-font,inherit\);font-size:2\.4rem[^}]*color:var\(--token-color-primary\)/);
  assert.match(sheet, /\.ep-desc-2\{-webkit-line-clamp:2\}/);
});

test("compact: one hairline line per item, time 64px, performer muted at the right, no images", () => {
  assert.match(sheet, /\.ep-line\{[^}]*grid-template-columns:64px minmax\(0,1fr\) auto[^}]*padding:0\.6rem 0;border-bottom:1px solid var\(--ep-sep\)/);
  assert.match(sheet, /\.ep-line\{padding:0\.75rem 0\}/, "0.75rem from 640px");
  assert.match(sheet, /\.ep-line-performer\{[^}]*color:var\(--token-color-muted\);text-align:right/);
  const compact = layouts.slice(layouts.indexOf("export function CompactRow"), layouts.indexOf("export function LineupTile"));
  assert.ok(compact.length > 100, "the compact row is where it is expected");
  assert.doesNotMatch(compact, /<img/, "the compact row renders no image");
});

test("schedule: grid from 640px, surface blocks with a line border, compact-by-space list on phones", () => {
  assert.match(sheet, /\.ep-grid\{display:none/);
  assert.match(sheet, /@media \(min-width:640px\)\{\[data-event-program\] \.ep-grid\{display:grid\}\[data-event-program\] \.ep-schedule-phone\{display:none\}\}/);
  assert.match(sheet, /\.ep-block\{[^}]*border:1px solid var\(--token-color-line\);border-radius:8px;background:var\(--ep-surface\)/);
  assert.match(layouts, /gridTemplateRows: `auto repeat\(\$\{grid\.slotLabels\.length\}/, "rows come from the 30-minute slots");
});

test("lineup: 2 → 3 → 4 tiles, 4:5, bottom scrim from the background token to 85%, initials panel in the heading font", () => {
  assert.match(sheet, /\.ep-tiles\{[^}]*grid-template-columns:repeat\(2,/);
  assert.match(sheet, /@media \(min-width:640px\)\{\[data-event-program\] \.ep-tiles\{grid-template-columns:repeat\(3,/);
  assert.match(sheet, /@media \(min-width:1024px\)\{\[data-event-program\] \.ep-tiles\{grid-template-columns:repeat\(4,/);
  assert.match(sheet, /\.ep-tile-link\{[^}]*aspect-ratio:4\/5/);
  assert.match(sheet, /\.ep-tile-scrim\{[^}]*linear-gradient\(to bottom,transparent,color-mix\(in srgb,var\(--token-color-background\) 85%,transparent\)\)/);
  assert.match(sheet, /\.ep-tile-panel\{[^}]*font-family:var\(--site-heading-font,inherit\)/);
  assert.match(sheet, /\.ep-tile-name\{font-family:var\(--site-heading-font,inherit\)/);
});

test("drawer: the checkout's shell (88svh sheet, 440px panel, scrim), a dialog with a close control, a trigger that looks like the row", () => {
  assert.match(sheet, /\.ep-sheet\{position:fixed;left:0;right:0;bottom:0[^}]*max-height:88svh/);
  assert.match(sheet, /@media \(min-width:1024px\)\{\[data-event-program\] \.ep-sheet\{inset:0 0 0 auto;width:440px/);
  assert.match(sheet, /\.ep-scrim\{position:fixed;inset:0/);
  // The trigger reset must come BEFORE every layout rule and own nothing the
  // layout owns (padding, border, display): a late `padding:0;border:0` is
  // exactly what stripped the timeline rows of their separators once.
  const resetAt = sheet.indexOf(".ep-trigger{");
  assert.ok(resetAt >= 0);
  assert.match(sheet, /\.ep-trigger\{all:unset;display:block;box-sizing:border-box;width:100%;cursor:pointer;text-align:left;font:inherit;color:inherit\}/);
  for (const cls of ["ep-item", "ep-card", "ep-tile-link", "ep-line"]) {
    assert.ok(sheet.indexOf(`.${cls}{`) > resetAt, `${cls} rule comes after the trigger reset`);
  }
  assert.equal((sheet.match(/\.ep-trigger[^{]*\{/g) ?? []).length, 2, "one reset rule and one focus ring; nothing else targets the trigger");
  assert.doesNotMatch(sheet, /(?:^|[\s,}])(?:button|div|li|span|a)\.ep-/m, "no rule depends on the element name: a row is styled by its class whether it is a button or a div");
  assert.match(sheet, /\.ep-close\{min-height:44px/);
  assert.match(sheet, /\.ep-cta\{[^}]*min-height:48px[^}]*background:var\(--token-color-primary\);color:var\(--token-color-primary-on/);
  assert.match(drawer, /role="dialog" aria-modal="true" aria-labelledby=\{titleId\} data-testid="event-program-drawer"/);
  assert.match(drawer, /data-testid="event-program-drawer-close"/);
  assert.match(drawer, /document\.body\.style\.overflow = "hidden"/, "scroll lock");
  assert.match(drawer, /opener\?\.focus\?\.\(\)/, "focus returns to the trigger");
  assert.match(layouts, /aria-haspopup="dialog"/);
});

test("no emoji, no glyph fallback, anywhere in the block's copy, sheets or markup", () => {
  // Emoji, dingbats, misc symbols, geometric shapes, variation selectors, ZWJ (the ⇒ in a doc comment is not a glyph the page renders).
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
  const files = ["event-program-copy.ts", "event-program-css.ts", "event-program-css-cards.ts", "event-program-css-schedule.ts", "event-program-css-lineup.ts", "event-program-css-drawer.ts", "event-program-island.tsx", "event-program-layouts.tsx", "event-program-drawer.tsx", "event-program-drawer-model.ts", "event-program-model.ts", "event-program-lineup-tiles.ts", "event-program-schedule-grid.ts"];
  for (const name of files) assert.doesNotMatch(read(name), emoji, `${name} carries an emoji or symbol glyph`);
  assert.doesNotMatch(layouts, /kind === "doors" \|\| item\.kind === "close"/, "a kind is never special-cased into a symbol");
  assert.match(layouts, /const kindLabel = kind \? t\(`kind_\$\{(placed\.)?item\.kind\}`\) : null;/, "a kind is a word, only on showKind");
});

test("the wrapper token is scoped to the kind and the renderer emits it", () => {
  assert.match(scope, /"event-program": "event_program"/);
  assert.match(renderer, /className="site-builder-node site-builder-node--event-program"/);
  assert.match(renderer, /options\.dataSources\.linkedEventId/, "the linked event reaches the island");
  assert.match(renderer, /editor=\{options\.contentLocale\?\.editorPreview === true\}/);
});
