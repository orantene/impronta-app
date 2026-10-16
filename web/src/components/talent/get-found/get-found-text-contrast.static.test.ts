/**
 * TUL-1226: /talent/get-found was reported with very pale headings and values.
 * The page now sets its own ink and font, and no text on it uses a grey that
 * fails AA on white (neutral-400 is about 2.5:1).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = __dirname;
const page = readFileSync(join(dir, "../../../app/(workspace)/talent/get-found/page.tsx"), "utf8");

test("the page declares its own ink and font", () => {
  assert.match(page, /GET_FOUND_TEXT = \{ color: "#0B0B0D"/);
  assert.match(page, /<div style=\{GET_FOUND_TEXT\}>/);
});

test("no get-found text uses a grey below AA on white", () => {
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(src, /text-neutral-(?:100|200|300|400)\b/, `${f} has a text grey under 4.5:1`);
  }
});
