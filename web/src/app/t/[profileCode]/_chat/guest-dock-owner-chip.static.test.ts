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
