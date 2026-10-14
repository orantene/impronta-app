import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// TUL-532 PM-LIVE7: on a phone the kit-shell header bar fell into the default
// container stack, so valeria's wordmark and BOOK sat on two lines flush
// against x=0 (166px header). The bar keeps one padded row instead.
test("TUL-532: the kit-shell header bar stays one padded row on a phone", () => {
  const src = readFileSync(path.join(__dirname, "render.tsx"), "utf8");
  const stack = src.indexOf(
    `.site-builder-node--container[data-builder-mobile-layout="stack"],.site-builder-node--container:not([data-builder-mobile-layout]){display:flex;flex-direction:column}`,
  );
  const bar = `[data-talent-max-site-header]>.site-builder-node--container[data-builder-layout="row"]:not([data-builder-mobile-layout])`;
  const row = src.indexOf(`${bar}{flex-direction:row;flex-wrap:nowrap;`);
  assert.ok(stack >= 0, "phone stack rule present");
  assert.ok(row > stack, "the header row rule follows the stack default so it wins");
  const media = src.lastIndexOf("@media", row);
  assert.ok(media > 0 && media < stack, "the row rule lives in the same phone media block");
  assert.match(src.slice(row, row + 400), /padding-inline:1\.5rem/);
  assert.ok(src.includes(`${bar}>.site-builder-node--heading{flex:0 1 auto;min-width:0;align-self:center}`));
  assert.ok(src.includes(`${bar}>.site-builder-node--nav{flex:0 0 auto;width:auto;margin:0 0 0 auto}`));
});
