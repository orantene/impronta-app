import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMaisonCustomPalette } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import {
  buildLiveDesignChangeSummary,
  paletteDisplayName,
  serviceMenuStyleLabel,
} from "./live-design-change";

describe("buildLiveDesignChangeSummary", () => {
  it("names old and new design, menu style and palette (EN)", () => {
    const s = buildLiveDesignChangeSummary({
      locale: "en",
      fromSlug: "maison",
      toSlug: "folio",
      paletteName: "Rosé",
      counts: { services: 12, photos: 8 },
    });
    assert.equal(s.title, "Publish Folio?");
    assert.equal(
      s.changes,
      "Layout: Maison → Folio · section order · service menu shown as a rate card · colors: Rosé",
    );
    assert.equal(
      s.stays,
      "Your 12 services, 8 photos, intro, booking settings and address. You can restore Maison afterwards from Design options.",
    );
    assert.equal(s.toast, "✓ Folio is live");
  });

  it("omits numbers gracefully when counts are unknown", () => {
    const s = buildLiveDesignChangeSummary({
      locale: "en",
      fromSlug: "maison",
      toSlug: "mono",
      paletteName: "My colors",
    });
    assert.ok(s.stays.startsWith("Your services, photos, intro"));
  });

  it("has Spanish copy with no em dashes", () => {
    const s = buildLiveDesignChangeSummary({
      locale: "es",
      fromSlug: "solace",
      toSlug: "frame",
      paletteName: "Salvia y oliva",
    });
    assert.equal(s.title, "¿Publicar Frame?");
    assert.ok(s.changes.includes("Solace → Frame"));
    assert.ok(s.stays.startsWith("Tus servicios"));
    for (const line of [s.title, s.changes, s.stays, s.toast]) {
      assert.ok(!line.includes("—"));
    }
  });

  it("falls back for unknown designs", () => {
    assert.equal(serviceMenuStyleLabel("en", "nope"), "the design's style");
  });
});

describe("paletteDisplayName", () => {
  it("shows the gallery palette name (localized) for a stored custom palette", () => {
    const folio = getGalleryDesign("folio");
    assert.ok(folio && folio.palettes.length > 0);
    const p = folio.palettes[0]!;
    const stored = buildMaisonCustomPalette(
      { page: p.page, text: p.text, accent: p.accent, section: p.section },
      { en: "My colors", es: "Mis colores" },
    );
    assert.equal(
      paletteDisplayName({ locale: "en", designSlug: "folio", lookSlug: null, customPalette: stored }),
      p.name.en,
    );
    assert.equal(
      paletteDisplayName({ locale: "es", designSlug: "folio", lookSlug: null, customPalette: stored }),
      p.name.es,
    );
  });

  it("keeps a real custom palette's saved name", () => {
    const p = getGalleryDesign("folio")!.palettes[0]!;
    const stored = buildMaisonCustomPalette(
      { page: p.text, text: p.page, accent: p.text, section: p.text },
      { en: "Studio", es: "Estudio" },
    );
    assert.equal(
      paletteDisplayName({ locale: "en", designSlug: "folio", lookSlug: null, customPalette: stored }),
      "Studio",
    );
  });

  it("names a Maison look palette and falls back to My colors", () => {
    const maison = getGalleryDesign("maison")!;
    const key = maison.palettes[0]!.key;
    assert.equal(
      paletteDisplayName({ locale: "en", designSlug: "maison", lookSlug: `maison-${key}`, customPalette: null }),
      maison.palettes[0]!.name.en,
    );
    assert.equal(
      paletteDisplayName({ locale: "es", designSlug: "maison", lookSlug: null, customPalette: null }),
      "Mis colores",
    );
  });

  it("names Folio collection Look rows (folio-stone) and bare keys", () => {
    const folio = getGalleryDesign("folio")!;
    const stone = folio.palettes.find((p) => p.key === "stone")!;
    assert.equal(
      paletteDisplayName({
        locale: "en",
        designSlug: "folio",
        lookSlug: "folio-stone",
        customPalette: null,
      }),
      stone.name.en,
    );
    assert.equal(
      paletteDisplayName({
        locale: "es",
        designSlug: "folio",
        lookSlug: "folio-stone",
        customPalette: null,
      }),
      stone.name.es,
    );
    assert.equal(
      paletteDisplayName({
        locale: "en",
        designSlug: "folio",
        lookSlug: "stone",
        customPalette: null,
      }),
      stone.name.en,
    );
  });
});
