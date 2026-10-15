import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

// QA Prod at 390px: promo sheets scrolled sideways by ~13px. Grid tracks need
// minmax(0,1fr) (native date inputs and money strings have a wide min-content),
// scroll containers must clip x, and chip rows must wrap rather than overflow.

test("every promo sheet scroll container clips horizontal overflow", () => {
  const cases: Array<[string, RegExp]> = [
    ["talent/QuickCreateDrawer.tsx", /overflow-y-auto overflow-x-hidden/],
    ["talent/PromoDetailSheet.tsx", /overflow-y-auto overflow-x-hidden/],
    ["talent/PromosPage.tsx", /overflow-x-hidden overflow-y-auto/],
    ["share/promo-share-sheet.tsx", /overflow-x-hidden overflow-y-auto/],
    ["talent/PromosDrawer.tsx", /overflow-x-hidden overflow-y-auto/],
  ];
  for (const [file, re] of cases) assert.match(read(file), re, file);
  for (const file of ["talent/QuickCreateDrawer.tsx", "talent/PromoDetailSheet.tsx"]) {
    assert.match(read(file), /max-w-full flex-col gap-0 overflow-x-hidden/, `${file} SheetContent`);
  }
});

test("promo sheet grids use minmax(0,1fr) tracks, never bare grid-cols-2/3", () => {
  for (const file of [
    "talent/QuickCreateDrawer.tsx",
    "talent/PromoDetailSheet.tsx",
    "share/promo-share-sheet.tsx",
    "results/PromoResultsCard.tsx",
    "results/MonthRollup.tsx",
  ]) {
    assert.doesNotMatch(read(file), /grid-cols-[23]\b/, `${file} has a bare grid-cols-2/3`);
  }
});

test("chip rows wrap and date/time inputs can shrink", () => {
  const q = read("talent/QuickCreateDrawer.tsx");
  assert.doesNotMatch(q, /className="flex gap-2 overflow-x-auto"/);
  assert.match(q, /flex flex-wrap gap-2" aria-label=\{copy\.t\("preview\.no_service"\)\}/);
  const inputs = [...q.matchAll(/<input type="(?:date|time)"[^>]*className="([^"]*)"/g)];
  assert.ok(inputs.length >= 4);
  for (const m of inputs) assert.match(m[1]!, /w-full min-w-0/, "date/time input must be w-full min-w-0");
  assert.match(q, /inline-flex max-w-full flex-wrap items-center gap-1/);
});
