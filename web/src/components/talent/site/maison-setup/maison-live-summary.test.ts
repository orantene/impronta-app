/**
 * Live card naming for sites with and without a catalog design slug (a site
 * built by hand before the design catalog, e.g. TAL-93938).
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { legacyPaletteLabel, liveCardDesignLabel } from "./maison-live-summary";

test("a design slug keeps its catalog name", () => {
  assert.equal(
    liveCardDesignLabel({ locale: "en", designSlug: "maison", legacyProfileTemplate: null }),
    liveCardDesignLabel({ locale: "en", designSlug: "maison", legacyProfileTemplate: "noir" }),
  );
  assert.notEqual(
    liveCardDesignLabel({ locale: "en", designSlug: "maison", legacyProfileTemplate: null }),
    "Custom design",
  );
});

test("no slug + legacy Maison profile template → Maison (original)", () => {
  assert.equal(
    liveCardDesignLabel({ locale: "en", designSlug: null, legacyProfileTemplate: "maison" }),
    "Maison (original)",
  );
  assert.equal(
    liveCardDesignLabel({ locale: "es", designSlug: "  ", legacyProfileTemplate: " Maison " }),
    "Maison (original)",
  );
});

test("no slug, no Maison template → Custom design (EN + ES)", () => {
  assert.equal(
    liveCardDesignLabel({ locale: "en", designSlug: null, legacyProfileTemplate: null }),
    "Custom design",
  );
  assert.equal(
    liveCardDesignLabel({ locale: "es", designSlug: null, legacyProfileTemplate: "noir" }),
    "Diseño personalizado",
  );
});

test("legacy palette: Your colors only when a custom palette exists", () => {
  assert.equal(legacyPaletteLabel("en", null), null);
  const palette = { name: { en: "", es: "" } } as unknown as MaisonCustomPaletteStored;
  assert.equal(legacyPaletteLabel("en", palette), "Your colors");
  assert.equal(legacyPaletteLabel("es", palette), "Tus colores");
});
