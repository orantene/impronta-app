import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { searchCatalogRows, sortCatalogRows } from "../../../../lib/messages-v5/catalog-search";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, "GuestDockCatalog.tsx"), "utf8");

test("TUL-1064: search and sort show on a talent's categorized service menu too", () => {
  assert.doesNotMatch(src, /\{!usingServices \? \(\s*<div style=\{\{ padding: "0 14px" \}\}>\s*<input/);
  assert.match(src, /visibleServices\.map\(/);
  assert.match(src, /searchCatalogRows\(\s*serviceMenu/);
});

test("TUL-1064: length + available filters stay catalog-only (service menu has no such data)", () => {
  assert.match(src, /\{!usingServices \? \(<>\s*<select\s*value=\{maxMinutes/);
});

test("TUL-1064: service menu rows search accent-insensitively and sort by price", () => {
  const rows = [
    { title: "Manicure gel", sub: null, amountCents: 50000, available: true },
    { title: "Depilación cejas", sub: null, amountCents: 20000, available: true },
  ];
  assert.deepEqual(searchCatalogRows(rows, "depilacion").map((r) => r.title), ["Depilación cejas"]);
  assert.deepEqual(sortCatalogRows(rows, "price_asc").map((r) => r.title), ["Depilación cejas", "Manicure gel"]);
});
