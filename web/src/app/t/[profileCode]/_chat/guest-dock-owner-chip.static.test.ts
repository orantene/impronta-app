import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

test("the dock renders owner chips through showOwnerChips and catalogOwnerBy", () => {
  const src = readFileSync(join(HERE, "GuestDockCatalog.tsx"), "utf8");
  assert.match(src, /showOwnerChips/);
  assert.match(src, /public\.guestChat\.catalogOwnerBy/);
});

test("a11y (09 finding): owner line is readable, wraps, and has a title", () => {
  const src = readFileSync(join(HERE, "GuestDockCatalog.tsx"), "utf8");
  const start = src.indexOf("data-guest-catalog-owner");
  const line = src.slice(start, src.indexOf("</div>", start));
  assert.match(line, /title=\{/);
  assert.match(line, /fontSize: 12\.5/);
  assert.doesNotMatch(line, /textOverflow: "ellipsis"/);
});
