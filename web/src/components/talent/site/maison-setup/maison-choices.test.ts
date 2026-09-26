import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultMaisonChoices,
  parseMaisonChoices,
  MAISON_CHOICES_STORAGE_PREFIX,
} from "./maison-choices";

describe("maison-choices", () => {
  it("defaults to gallery + pink demo preview", () => {
    const d = defaultMaisonChoices();
    assert.equal(d.screen, "gallery");
    assert.equal(d.paletteKey, "pink");
    assert.equal(d.contentMode, "demo");
    assert.equal(d.status, "Preview");
    assert.equal(d.phoneSheet, null);
    assert.equal(d.useCustomPalette, false);
    assert.equal(d.customPalette, null);
  });

  it("resumes detail + lilac + mine (W33)", () => {
    const parsed = parseMaisonChoices({
      screen: "detail",
      paletteKey: "lilac",
      contentMode: "mine",
      previewDevice: "phone",
      status: "Choices saved",
      phoneSheet: "colors",
    });
    assert.equal(parsed.screen, "detail");
    assert.equal(parsed.paletteKey, "lilac");
    assert.equal(parsed.contentMode, "mine");
    assert.equal(parsed.previewDevice, "phone");
    assert.equal(parsed.status, "Choices saved");
    // Sheets must not survive reopen.
    assert.equal(parsed.phoneSheet, null);
  });

  it("rejects unknown palette keys", () => {
    assert.equal(parseMaisonChoices({ paletteKey: "neon" }).paletteKey, "pink");
  });

  it("resumes review screen after apply (PR5)", () => {
    const parsed = parseMaisonChoices({
      screen: "review",
      status: "Draft saved",
      paletteKey: "lilac",
      contentMode: "mine",
    });
    assert.equal(parsed.screen, "review");
    assert.equal(parsed.status, "Draft saved");
  });

  it("uses a stable storage prefix", () => {
    assert.equal(MAISON_CHOICES_STORAGE_PREFIX, "maison-setup-choices:");
  });

  it("resumes saved My colors (W64)", () => {
    const parsed = parseMaisonChoices({
      screen: "detail",
      useCustomPalette: true,
      customPalette: {
        name: { en: "My colors", es: "Mis colores" },
        fields: {
          page: "#FFFBF4",
          text: "#2B1C14",
          accent: "#A34E2C",
          section: "#F3E6D6",
        },
      },
    });
    assert.equal(parsed.useCustomPalette, true);
    assert.equal(parsed.customPalette?.name.en, "My colors");
    assert.equal(parsed.customPalette?.fields.accent, "#A34E2C");
  });
});
