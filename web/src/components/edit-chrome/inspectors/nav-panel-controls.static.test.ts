import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/**
 * Source assertions on the nav inspector's controls. Each pins a defect that
 * was live in the shipped panel and invisible to a reader of the rendered UI.
 */
const CONTENT = readFileSync(
  new URL("./builder-node-content.tsx", import.meta.url),
  "utf8",
);
const THUMBS = readFileSync(
  new URL("./site-header/thumbnails.tsx", import.meta.url),
  "utf8",
);

test("each mobile-menu choice has its OWN thumbnail", () => {
  // "dropdown" borrowed the sheet-bottom picture, so two of the four chips
  // were identical and the operator could not tell them apart.
  const block = CONTENT.slice(
    CONTENT.indexOf("const NAV_MOBILE_MENU_OPTIONS"),
    CONTENT.indexOf("function BuilderNodeFlatPanel"),
  );
  const thumbs = [...block.matchAll(/Thumb: (MobileNavThumb_\w+)/g)].map((m) => m[1]);
  assert.equal(thumbs.length, 4, "expected four mobile-menu choices");
  assert.equal(
    new Set(thumbs).size,
    4,
    `two choices share a picture: ${thumbs.join(", ")}`,
  );
  assert.match(THUMBS, /export function MobileNavThumb_Dropdown\(/);
});

test("the reorder hint is backed by a real drag handler", () => {
  // The panel promised "Drag to reorder" with no drag handler anywhere.
  assert.match(CONTENT, /<DraggableList\b/);
  assert.match(CONTENT, /\{\.\.\.handleProps\}/);
  assert.ok(
    !/Drag to reorder\./.test(CONTENT),
    "the old hint claimed dragging the row itself worked",
  );
});

test("menu colours offer a real picker, not only a text box", () => {
  const block = CONTENT.slice(
    CONTENT.indexOf('["menuBackground"'),
    CONTENT.indexOf("Auto-populate links from"),
  );
  assert.match(block, /<ColorSwatchButton/);
  assert.match(
    block,
    /<input/,
    "the text input must stay — a theme token is not expressible in a colour picker",
  );
});
