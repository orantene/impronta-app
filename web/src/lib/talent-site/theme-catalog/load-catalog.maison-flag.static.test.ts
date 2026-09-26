/**
 * loadTalentThemeCatalog must filter Maison rows via the Maison flag
 * (flags-off production unchanged). Static contract — no Next cache needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/theme-catalog/load-catalog.server.ts"),
  "utf8",
);

test("loadTalentThemeCatalog imports Maison flag + catalog filter", () => {
  assert.match(SRC, /isTalentMaisonThemeEnabled/);
  assert.match(SRC, /filterCatalogRowsForMaisonFlag/);
});

test("loadTalentThemeCatalog applies filter to DB rows and built-ins fallback", () => {
  assert.match(
    SRC,
    /filterCatalogRowsForMaisonFlag\(\s*raw,\s*isTalentMaisonThemeEnabled\(\)\s*\)/,
  );
});
