import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { PROMO_SHARE_LAYER, PROMO_SHARE_QR_LAYER } from "@/components/promos/share/layers";

/**
 * QA Prod 2026-10-14: the share sheet opened behind the detail sheet, the
 * preview pill showed no text and sheet headings used a decorative face.
 * Static pins, because these are class-level contracts a refactor can silently undo.
 */
const read = (rel: string) => blankComments(readFileSync(join(process.cwd(), rel), "utf8"));

test("the share sheet sits above Radix sheets (z-50) and its QR above the sheet", () => {
  const z = (c: string) => Number(/z-\[(\d+)\]/.exec(c)?.[1]);
  assert.ok(z(PROMO_SHARE_LAYER) > 50);
  assert.ok(z(PROMO_SHARE_QR_LAYER) > z(PROMO_SHARE_LAYER));
  assert.match(read("src/components/promos/share/promo-share-sheet.tsx"), /PROMO_SHARE_LAYER/);
});

test("the detail sheet closes while the share sheet is open (a Radix modal would trap the clicks)", () => {
  assert.match(read("src/components/promos/talent/PromosPage.tsx"), /item=\{shareItem \? null : detail\}/);
});

test("the preview pill has readable ink and a label", () => {
  const s = read("src/components/promos/talent/PromoPreview.tsx");
  assert.match(s, /text-\[#1c1c1e\]/);
  assert.match(s, /aria-label=\{copy\.t\("preview\.save"/);
});

test("all promo sheets use the dashboard heading style, not the display face", () => {
  for (const f of ["PromoDetailSheet", "QuickCreateDrawer", "PromosPage"]) {
    assert.match(read(`src/components/promos/talent/${f}.tsx`), /<SheetTitle className=\{[^}]*UI\.title/, f);
  }
});

test("results components use the dashboard tokens, not the app theme tokens that render black in a sheet", () => {
  for (const f of ["PromoResultsCard", "PromoCallout", "MonthRollup", "PromoHomeLine"]) {
    const s = read(`src/components/promos/results/${f}.tsx`);
    assert.doesNotMatch(s, /\b(?:bg-card|text-foreground|text-muted-foreground|border-border)\b/, f);
  }
});

test("detail sheet: one merged results card (no repeated title) and a grid footer", () => {
  const d = read("src/components/promos/talent/PromoDetailSheet.tsx");
  assert.match(d, /hideTitle/);
  assert.match(d, /progress=\{progressBody\}/);
  assert.match(d, /data-promo-footer-grid/);
  assert.match(d, /grid-cols-1[^"]*grid-cols-\[repeat\(2,minmax\(0,1fr\)\)\]/);
  assert.match(read("src/components/promos/results/PromoResultsCard.tsx"), /props\.hideTitle \? null/);
});

test("promo sheets set an ink text colour so the shared close button and icons are visible (they inherited near-white)", () => {
  for (const f of ["PromosDrawer", "PromosPage", "PromoDetailSheet", "QuickCreateDrawer"]) {
    const s = read(`src/components/promos/talent/${f}.tsx`);
    const m = /<SheetContent[\s\S]*?>/.exec(s);
    assert.ok(m, f);
    assert.match(m![0], /text-\[var\(--tc-ink,#1c1c1e\)\]/, f);
  }
});

test("wide viewports: max width, responsive card grid, template columns and an md+ side panel", () => {
  const page = read("src/components/promos/talent/PromosPage.tsx");
  assert.match(page, /data-promos-page className="mx-auto flex w-full max-w-5xl/);
  assert.match(page, /grid-cols-\[minmax\(0,1fr\)\][^"]*md:grid-cols-\[repeat\(2,minmax\(0,1fr\)\)\][^"]*xl:grid-cols-\[repeat\(3,minmax\(0,1fr\)\)\]/);
  assert.match(page, /<TemplateGrid copy=\{copy\} onPick=\{start\} wide \/>/);
  const grid = read("src/components/promos/talent/TemplateGrid.tsx");
  assert.match(grid, /md:grid-cols-\[repeat\(3,minmax\(0,1fr\)\)\] xl:grid-cols-\[repeat\(4,minmax\(0,1fr\)\)\]/);
  const ui = read("src/components/promos/talent/ui.tsx");
  assert.match(ui, /PANEL_MD =\s*"md:inset-y-0[^"]*md:max-w-lg[^"]*md:rounded-l-3xl/);
  for (const f of ["PromosPage", "QuickCreateDrawer", "PromoDetailSheet"]) {
    assert.match(read(`src/components/promos/talent/${f}.tsx`), /\$\{PANEL_MD\}/, f);
  }
});
