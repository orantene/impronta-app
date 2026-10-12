import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { bandColumns } from "./band-columns";
import { FEATURE_GROUP_ORDER, featuresForHomeSection } from "./index";

const web = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");

test("bandColumns: never wider than the band, never a lone last card when avoidable", () => {
  assert.equal(bandColumns(1, 4), 1);
  assert.equal(bandColumns(3, 4), 3);
  assert.equal(bandColumns(4, 4), 4);
  assert.equal(bandColumns(5, 4), 3, "5 at four-up is 3 + 2");
  assert.equal(bandColumns(9, 4), 3);
  assert.equal(bandColumns(4, 3), 2, "4 at three-up is 2 + 2");
  assert.equal(bandColumns(5, 3), 3);
  assert.equal(bandColumns(6, 2), 2);
});

test("TUL-565: no home feature band ends on a lone card at 1280 (four-up) or 1024 (three-up)", () => {
  for (const section of ["one", "two"] as const) {
    const features = featuresForHomeSection(section);
    for (const group of FEATURE_GROUP_ORDER) {
      const n = features.filter((f) => f.group === group).length;
      if (n < 2) continue;
      for (const max of [4, 3]) {
        const cols = bandColumns(n, max);
        assert.notEqual(n % cols, 1, `${section}/${group}: ${n} cards in ${cols} columns`);
      }
    }
  }
});

test("TUL-565: the grid sizes bands by bandColumns and centres short rows", () => {
  const grid = read("src/components/marketing/features/feature-plate-grid.tsx");
  assert.match(grid, /className="mkt-band mt-6"/);
  assert.match(grid, /"--cols-xl": bandColumns\(count, 4\)/);
  assert.doesNotMatch(grid, /xl:grid-cols-4/);
  const css = read("src/app/globals.css");
  assert.match(css, /\.mkt-band \{[^}]*justify-content: center;/);
});

test("TUL-565: home section H2s share one size scale", () => {
  const scale = /<h2\s+className="[^"]*\btext-\[2rem\][^"]*\bsm:text-\[2\.75rem\] md:text-\[3rem\]"/g;
  const bands = read("src/components/marketing/features/home-feature-sections.tsx");
  assert.equal(bands.match(scale)?.length, 2);
  assert.doesNotMatch(bands, /clamp\(1\.9rem/);
  for (const f of ["audience-split-section", "flagship-section", "product-tour-section", "case-studies-section", "network-section", "pricing-teaser-section", "faq-section"]) {
    assert.match(read(`src/components/marketing/${f}.tsx`), new RegExp(scale.source), f);
  }
});
