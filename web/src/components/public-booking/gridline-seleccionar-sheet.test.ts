/**
 * TUL-516 W3-4: Gridline matrix Seleccionar always opens the sheet (one behaviour).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("services-catalog-filter: matrix rows open the sheet on Seleccionar", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-node/services-catalog-filter.tsx"),
    "utf8",
  );
  assert.match(src, /matrix \|\| catalogRowOpensSheetImmediately\(item\)/);
  assert.match(src, /Gridline \(matrix\): one behaviour/);
});
