import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDemoContentFixture, validateDemoContentFixture } from "./content-fixture";
import { demosFor } from "./registry";
import { folioSiteCopyFor, FOLIO_DEMO_SITE_COPY } from "./folio-site-copy";
import { demoSiteSettingsFor } from "./demo-site-settings";
import { demoCardPersonName, demoProfileMetaFor } from "./demo-profile-meta";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";

test("Folio guide demos each have a content fixture with FAQ and stats", () => {
  const folio = demosFor("folio").filter((d) => !d.reference && d.contentFixture);
  assert.ok(folio.length >= 7, `expected Folio guide demos, got ${folio.length}`);
  for (const d of folio) {
    const fx = loadDemoContentFixture(d.contentFixture!);
    assert.deepEqual(validateDemoContentFixture(fx), [], d.profileCode);
    assert.equal(fx.profileCode, d.profileCode);
    assert.ok(fx.faq.items.length >= 2, `${d.profileCode} FAQ`);
    assert.ok(fx.stats.length >= 2, `${d.profileCode} stats`);
    assert.ok(fx.talent.displayName.length > 0);
  }
});

test("Mateo reference FAQ is filled", () => {
  const mateo = loadDemoContentFixture("folio");
  assert.ok(mateo.faq.items.length >= 3);
});

test("folio site copy differs per demo (no shared caption for Rafa)", () => {
  const mateo = folioSiteCopyFor("TAL-93011");
  const rafa = folioSiteCopyFor("TAL-93114");
  assert.equal(mateo.coverStatement, FOLIO_DEMO_SITE_COPY.coverStatement);
  assert.notEqual(rafa.coverStatement, mateo.coverStatement);
  assert.match(rafa.coverStatement, /cantante|singer|música|music|Vallarta/i);
});

test("demo site settings vary across demos", () => {
  const linh = demoSiteSettingsFor("TAL-93103");
  const camila = demoSiteSettingsFor("TAL-93003");
  assert.equal(linh.chatEnabled, false);
  assert.equal(camila.chatEnabled, true);
  assert.equal(linh.bookingMode, "request");
  assert.equal(camila.bookingMode, "instant");
});

test("demo cards resolve person names from gallery sources", () => {
  const folio = getGalleryDesign("folio")!;
  const lucia = folio.demos.find((d) => d.key === "fashion-model-lucia")!;
  assert.equal(demoCardPersonName(lucia, "es"), "Lucía Herrera");
  const meta = demoProfileMetaFor(lucia);
  assert.ok(meta);
  assert.equal(meta!.city, "Ciudad de México");
  assert.ok(meta!.siteLangs.includes("es"));
});

test("mature model ES trade is madura not senior", () => {
  const folio = getGalleryDesign("folio")!;
  const elena = folio.demos.find((d) => d.key === "mature-model")!;
  assert.equal(elena.name.es, "Modelo madura");
});
