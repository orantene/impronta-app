import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("TUL-985: Clients filter chips wrap at 390px instead of clipping off-screen", () => {
  const src = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/talent/pages/ClientsPage.tsx"), "utf8");
  const row = src.slice(src.indexOf("data-clients-filters") - 200, src.indexOf("data-clients-filters"));
  assert.match(row, /flex flex-wrap gap-2/);
  assert.doesNotMatch(row, /overflow-x-auto/);
});
