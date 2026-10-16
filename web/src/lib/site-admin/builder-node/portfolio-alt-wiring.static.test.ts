import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("both loadPortfolioSources callers pass the alt context", () => {
  const src = readFileSync("src/components/home/homepage-cms-data-sources.ts", "utf8");
  const calls = src.match(/loadPortfolioSources\([^\n]*loadPortfolioAltContext\([^\n]*/g) ?? [];
  assert.equal(calls.length, 2);
});

test("loadPortfolioSources accepts altContext and displayName", () => {
  const src = readFileSync("src/lib/site-admin/builder-node/portfolio-sources.ts", "utf8");
  assert.match(src, /altContext\?:/);
  assert.match(src, /\.\.\.opts\?\.altContext/);
});
