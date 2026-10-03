/**
 * P4 Theme detail: choices parse (demoKey / fromQuery), colors-kept rule.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { buildMaisonCustomPalette } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import {
  defaultMaisonChoices,
  exploreDesignPatch,
  parseMaisonChoices,
  persistableMaisonChoices,
  type MaisonSetupChoices,
} from "./maison-choices";
import {
  demoPreviewParam,
  demoSwitchPatch,
  effectiveColors,
  pickPalettePatch,
  resolveActiveDemo,
  useDemoColorsPatch,
} from "./theme-detail-model";

const folio = getGalleryDesign("folio")!;
const maisonV2 = getGalleryDesign("maison-v2")!;

function choices(over: Partial<MaisonSetupChoices> = {}): MaisonSetupChoices {
  return { ...defaultMaisonChoices(), designSlug: "folio", screen: "detail", ...over };
}

describe("choices parse: demoKey / fromQuery", () => {
  it("defaults are null", () => {
    const c = defaultMaisonChoices();
    assert.equal(c.demoKey, null);
    assert.equal(c.fromQuery, null);
    assert.equal(c.designPaletteKey, null);
  });

  it("round-trips a valid demo key, query and palette for the design", () => {
    const stored = persistableMaisonChoices(
      choices({ demoKey: "commercial-model", fromQuery: "  Model ", designPaletteKey: "light" }),
    );
    const parsed = parseMaisonChoices(JSON.parse(JSON.stringify(stored)));
    assert.equal(parsed.designSlug, "folio");
    assert.equal(parsed.demoKey, "commercial-model");
    assert.equal(parsed.fromQuery, "Model");
    assert.equal(parsed.designPaletteKey, "light");
  });

  it("drops a demo key or palette that is not in that design", () => {
    const parsed = parseMaisonChoices({ designSlug: "folio", demoKey: "dj", designPaletteKey: "rose" });
    assert.equal(parsed.demoKey, null);
    assert.equal(parsed.designPaletteKey, null);
  });

  it("drops empty / non-string queries and bounds long ones", () => {
    assert.equal(parseMaisonChoices({ fromQuery: "   " }).fromQuery, null);
    assert.equal(parseMaisonChoices({ fromQuery: 42 }).fromQuery, null);
    assert.equal(parseMaisonChoices({ fromQuery: "x".repeat(500) }).fromQuery!.length, 80);
  });

  it("exploreDesignPatch accepts the old one-arg call and the new options", () => {
    assert.deepEqual(exploreDesignPatch("mono"), {
      screen: "detail",
      status: "Preview",
      designSlug: "mono",
      demoKey: null,
      fromQuery: null,
      designPaletteKey: null,
      phoneSheet: null,
      detailTab: "preview",
    });
    const p = exploreDesignPatch("folio", { demoKey: "fashion-model", fromQuery: "Model" });
    assert.equal(p.demoKey, "fashion-model");
    assert.equal(p.fromQuery, "Model");
    assert.equal(exploreDesignPatch("folio", { demoKey: "nope" }).demoKey, null);
  });
});

describe("demo resolution", () => {
  it("planned demo falls back to the featured built demo with a note", () => {
    const r = resolveActiveDemo(folio, "illustrator");
    assert.equal(r.demo?.key, "fashion-model");
    assert.equal(r.requested?.key, "illustrator");
    assert.equal(r.plannedFallback, true);
  });

  it("built demo-talent and maison-seed demos produce a preview param", () => {
    assert.equal(demoPreviewParam("folio", folio.demos.find((d) => d.key === "commercial-model")!), "folio:commercial-model");
    assert.equal(demoPreviewParam("folio", folio.demos.find((d) => d.key === "illustrator")!), null);
    const maison = getGalleryDesign("maison")!;
    assert.equal(demoPreviewParam("maison", maison.demos[0]!), "maison:nails");
  });
});

describe("colors-kept rule", () => {
  it("on demo colors, switching demo follows the new demo's palette and is not 'kept'", () => {
    const c = choices({ demoKey: "fashion-model" });
    const { patch, kept } = demoSwitchPatch(folio, c, "commercial-model");
    assert.equal(kept, false);
    assert.equal(patch?.demoKey, "commercial-model");
    assert.equal("designPaletteKey" in (patch ?? {}), false);
    const after = { ...c, ...patch };
    const colors = effectiveColors(folio, folio.demos.find((d) => d.key === "commercial-model")!, after);
    assert.equal(colors.kind === "palette" && colors.palette.key, "light");
  });

  it("a picked palette is kept when the demo switches", () => {
    const c = { ...choices({ demoKey: "fashion-model" }), ...pickPalettePatch(folio, "dark") };
    const { patch, kept } = demoSwitchPatch(folio, c, "commercial-model");
    assert.equal(kept, true);
    const after = { ...c, ...patch };
    const colors = effectiveColors(folio, folio.demos.find((d) => d.key === "commercial-model")!, after);
    assert.equal(colors.kind === "palette" && colors.palette.key, "dark");
    assert.equal(after.designPaletteKey, "dark");
  });

  it("custom colors are kept when the demo switches", () => {
    const custom = buildMaisonCustomPalette({ page: "#FFFFFF", text: "#111111", accent: "#224466", section: "#F0F0F0" });
    const c = choices({ designSlug: "maison-v2", demoKey: "lash-artist", customPalette: custom, useCustomPalette: true });
    const { patch, kept } = demoSwitchPatch(maisonV2, c, "barber");
    assert.equal(kept, true);
    assert.equal(patch?.useCustomPalette, undefined);
    assert.equal(effectiveColors(maisonV2, null, { ...c, ...patch }).kind, "custom");
  });

  it("switching to a planned demo does nothing", () => {
    const { patch } = demoSwitchPatch(folio, choices(), "illustrator");
    assert.equal(patch, null);
  });

  it("Use demo colors clears the pick and custom", () => {
    const p = useDemoColorsPatch(folio, folio.demos[1]!);
    assert.equal(p.designPaletteKey, null);
    assert.equal(p.useCustomPalette, false);
  });
});

describe("F32: My content never wears the last demo's palette", () => {
  const darkDemo = maisonV2.demos.find((d) => d.defaultPalette && d.defaultPalette !== maisonV2.palettes[0]!.key)!;

  it("a demo with its own palette exists (fixture sanity)", () => {
    assert.ok(darkDemo, "expected a Maison v2 demo whose palette differs from the design default");
  });

  it("demo mode shows the demo's palette; My content falls back to the design default", () => {
    const c = choices({ designSlug: "maison-v2", demoKey: darkDemo.key });
    const demoColors = effectiveColors(maisonV2, darkDemo, c, "demo");
    assert.equal(demoColors.kind === "palette" && demoColors.palette.key, darkDemo.defaultPalette);
    const mine = effectiveColors(maisonV2, darkDemo, c, "mine");
    assert.equal(mine.kind === "palette" && mine.palette.key, maisonV2.palettes[0]!.key);
  });

  it("an explicit pick still wins in My content", () => {
    const c = { ...choices({ designSlug: "maison-v2", demoKey: darkDemo.key }), ...pickPalettePatch(maisonV2, "sage") };
    const mine = effectiveColors(maisonV2, darkDemo, c, "mine");
    assert.equal(mine.kind === "palette" && mine.palette.key, "sage");
  });
});
