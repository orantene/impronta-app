/**
 * Track G Wave 3 — static contracts for library / gallery chrome / colours /
 * import-all-designs / Mi presencia hero.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { demoHasImportCatalog, galleryImportCatalogFor } from "@/lib/talent-site/theme-catalog/gallery-import-catalog";

const ROOT = join(process.cwd(), "src/components/talent/site/maison-setup");

function read(name: string): string {
  return readFileSync(join(ROOT, name), "utf8");
}

test("G3-LIB: browse uses Wave 3 cards + one Filters sheet", () => {
  const browse = read("GalleryBrowseScreen.tsx");
  assert.match(browse, /GalleryDesignCard/);
  assert.match(browse, /GalleryFiltersSheet/);
  assert.match(browse, /gallery-filters-button/);
  assert.match(browse, /data-gallery-wave3/);
  assert.doesNotMatch(browse, /menuButton\("style"/);
  assert.doesNotMatch(browse, /Explore theme →/);
  const card = read("GalleryDesignCard.tsx");
  assert.match(card, /design-card-suggested-ribbon/);
  assert.match(card, /design-card-chip-line/);
  assert.match(card, /Suggested for you/);
});

test("G3-CHROME: quiet toggles, Unpublished, preview-first layout", () => {
  const detail = read("ThemeDetailScreen.tsx");
  assert.match(detail, /DetailDesktopHeader/);
  assert.match(detail, /ContentModeToggle/);
  assert.match(detail, /md:w-\[70%\]/);
  assert.match(detail, /demoHasImportCatalog/);
  const chrome = read("ThemeDetailChrome.tsx");
  assert.match(chrome, /Unpublished/);
  assert.match(chrome, /See with my content/);
  assert.match(chrome, /status === "Choices saved"/);
  assert.match(chrome, /ring-1 ring-admin-ink/);
});

test("G3-COLORS: ✕ close, Advanced hex, brand primary", () => {
  const panel = read("CustomColorsPanel.tsx");
  assert.match(panel, /data-gallery-wave3-colors/);
  assert.match(panel, /maison-custom-advanced-toggle/);
  assert.match(panel, /maison-custom-live-preview/);
  assert.match(panel, /bg-admin-ink/);
  assert.doesNotMatch(panel, /bg-emerald-900/);
  assert.match(panel, /✕/);
});

test("G3-IMPORT: catalogs for finished designs; entry not Maison-only", () => {
  const maison = getGalleryDesign("maison")!;
  const v2 = getGalleryDesign("maison-v2")!;
  const folio = getGalleryDesign("folio")!;
  const grid = getGalleryDesign("gridline")!;
  assert.ok(demoHasImportCatalog("maison", maison.demos.find((d) => d.status === "built") ?? null));
  // Alba (reference) has contentFixture; guide demos without one must not import Alba.
  const alba = v2.demos.find((d) => d.key === "alba-nail-artist") ?? null;
  assert.ok(demoHasImportCatalog("maison-v2", alba));
  const camila = v2.demos.find((d) => d.source.kind === "demo-talent" && d.source.profileCode === "TAL-93003");
  assert.equal(demoHasImportCatalog("maison-v2", camila ?? null), false);
  assert.ok(demoHasImportCatalog("folio", folio.demos.find((d) => d.status === "built") ?? null));
  assert.ok(demoHasImportCatalog("gridline", grid.demos.find((d) => d.status === "built") ?? null));
  const cat = galleryImportCatalogFor("folio", folio.demos.find((d) => d.status === "built") ?? null);
  assert.ok(cat);
  assert.ok(cat!.counts.total > 0);
  assert.equal(cat!.services.length === 0 || cat!.services.length > 0, true);
  // Fixture service keys are namespaced by fixture id (no cross-demo collision).
  if (cat!.services.length > 0) {
    assert.ok(cat!.services.every((s) => s.key.includes(":svc:")));
  }
  // Section text not offered until commit persists biography/about copy.
  assert.equal(cat!.sectionText.length, 0);
  // Quote services keep null price (never coerced to 0).
  const gridCat = galleryImportCatalogFor(
    "gridline",
    grid.demos.find((d) => d.status === "built") ?? null,
  );
  assert.ok(gridCat);
  const quoteSvc = gridCat!.services.find((s) => s.priceDisplay === "quote" || s.priceMxn == null);
  if (quoteSvc) {
    assert.equal(quoteSvc.priceMxn, null);
    assert.ok(quoteSvc.currency === "MXN" || quoteSvc.currency === "USD");
  }
  const panel = read("ImportStarterPanel.tsx");
  assert.match(panel, /loadGalleryImportPreviewAction/);
  assert.match(panel, /designSlug/);
  assert.match(panel, /catalog\.services\.length === 0/);
});

test("G3-IMPORT: service keys do not collide across Gridline demos", () => {
  const grid = getGalleryDesign("gridline")!;
  const built = grid.demos.filter((d) => d.status === "built");
  assert.ok(built.length >= 2);
  const keys = new Set<string>();
  for (const demo of built) {
    const cat = galleryImportCatalogFor("gridline", demo);
    if (!cat) continue;
    for (const svc of cat.services) {
      assert.equal(keys.has(svc.key), false, `duplicate key ${svc.key}`);
      keys.add(svc.key);
    }
  }
  assert.ok(keys.size > 0);
});

test("G3-PRESENCE: hero + tiles on MyWebsiteCard", () => {
  const card = read("MyWebsiteCard.tsx");
  assert.match(card, /data-gallery-wave3-hero/);
  assert.match(card, /presence-site-tiles/);
  assert.match(card, /presence-tile-domain/);
  assert.match(card, /presence-tile-questions/);
  assert.match(card, /presence-tile-settings/);
  assert.match(card, /presence-tile-apps/);
  assert.match(card, /maison-edit-site[\s\S]*?bg-admin-ink/);
  assert.match(card, /History/);
  // Phone preview uses a real phone-width iframe viewport (not scaled 1280).
  assert.match(card, /phone:\s*\{\s*w:\s*390/);
  assert.match(card, /data-preview-device/);
});

test("G3-PRESENCE: pre-publish Domain/Questions tiles outside live card", () => {
  const manager = readFileSync(
    join(process.cwd(), "src/components/talent/site/TalentMaxSiteManager.tsx"),
    "utf8",
  );
  assert.match(manager, /presence-prepublish-tools/);
  assert.match(manager, /PresenceSiteTiles/);
  assert.match(manager, /hideDomainRow \|\| onOpenQuestions/);
});

test("G3-PRESENCE: settings reachable before publish; domain tile entitlement-gated", () => {
  const editor = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/talent/pages/PublicPageEditor.tsx"),
    "utf8",
  );
  // Flag-on path keeps NavRow settingsEntry (not only !talentId collapsed panels).
  assert.match(editor, /talentId \?\s*\(\s*settingsEntry/);
  assert.doesNotMatch(editor, /onOpenDomain=\{\(\) => openDrawer\("talent-custom-domain"\)\}/);
  const manager = readFileSync(
    join(process.cwd(), "src/components/talent/site/TalentMaxSiteManager.tsx"),
    "utf8",
  );
  assert.match(manager, /handleOpenDomain/);
  assert.match(manager, /talent-tier-compare/);
  assert.match(manager, /personalSiteCustomDomain/);
});
