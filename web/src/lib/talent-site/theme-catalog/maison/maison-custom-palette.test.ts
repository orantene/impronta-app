import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import { MAISON_SEED } from "./seed";
import {
  buildMaisonCustomPalette,
  evaluateMaisonCustomContrast,
  maisonCustomLookTokens,
  suggestAccentForButtonContrast,
  MAISON_CUSTOM_CONTRAST_BUTTON,
} from "./maison-custom-palette";

const chef = MAISON_SEED.custom_colors_example_chef;

describe("maison-custom-palette (W60–W66)", () => {
  it("chef fixture: button contrast fails ~3.93 and suggests a passing accent", () => {
    const advisory = evaluateMaisonCustomContrast(chef.fields);
    assert.equal(advisory.messageKey, "adjust_button_contrast");
    assert.ok(advisory.buttonContrast !== null);
    assert.ok(
      Math.abs((advisory.buttonContrast ?? 0) - chef.check.button_contrast) < 0.15,
      `expected ~${chef.check.button_contrast}, got ${advisory.buttonContrast}`,
    );
    assert.ok(advisory.suggestionAccent);
    const after = contrastRatio("#FFFFFF", advisory.suggestionAccent!);
    assert.ok(after !== null && after >= MAISON_CUSTOM_CONTRAST_BUTTON);
  });

  it("Use this adjustment path: seed suggestion accent passes", () => {
    const ratio = contrastRatio("#FFFFFF", chef.check.suggestion_accent);
    assert.ok(ratio !== null && ratio >= MAISON_CUSTOM_CONTRAST_BUTTON);
    assert.ok((ratio ?? 0) >= chef.check.after.button_contrast - 0.2);
  });

  it("suggestAccent darkens same-hue terracotta until AA", () => {
    const suggested = suggestAccentForButtonContrast(chef.fields.accent);
    assert.ok(suggested);
    assert.notEqual(suggested, chef.fields.accent.toUpperCase());
    const ratio = contrastRatio("#FFFFFF", suggested!);
    assert.ok(ratio !== null && ratio >= MAISON_CUSTOM_CONTRAST_BUTTON);
  });

  it("derived rule + on_accent + look tokens (W60)", () => {
    const palette = buildMaisonCustomPalette(chef.fields);
    assert.equal(palette.name.en, "My colors");
    assert.equal(palette.name.es, "Mis colores");
    assert.match(palette.derived.rule, /^#[0-9A-F]{6}$/);
    assert.equal(palette.derived.on_accent, "#FFFFFF");
    const tokens = maisonCustomLookTokens(palette);
    assert.equal(tokens["color.background"], "#FFFBF4");
    assert.equal(tokens["color.ink"], "#2B1C14");
    assert.equal(tokens["color.primary"], "#C8643B");
    assert.equal(tokens["color.surface-raised"], "#F3E6D6");
  });

  it("advisory is never a hard fail — ok false still allows save", () => {
    const advisory = evaluateMaisonCustomContrast(chef.fields);
    assert.equal(advisory.ok, false);
    // Caller must not treat ok:false as a block (A10 / owner ruling 2).
    const saved = buildMaisonCustomPalette(chef.fields);
    assert.equal(saved.fields.accent, "#C8643B");
  });

  it("adjusted chef colors report Text is readable", () => {
    const adjusted = buildMaisonCustomPalette({
      ...chef.fields,
      accent: chef.check.suggestion_accent,
    });
    const advisory = evaluateMaisonCustomContrast(adjusted.fields);
    assert.equal(advisory.ok, true);
    assert.equal(advisory.messageKey, null);
  });
});
