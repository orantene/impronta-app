import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultMaisonChoices,
  isMaisonSetupResumable,
  maisonResumeSummaryLine,
  parseMaisonChoices,
  MAISON_CHOICES_STORAGE_PREFIX,
} from "./maison-choices";

describe("maison-choices", () => {
  it("defaults to gallery + pink + My content preview (W5-8)", () => {
    const d = defaultMaisonChoices();
    assert.equal(d.screen, "gallery");
    assert.equal(d.paletteKey, "pink");
    assert.equal(d.contentMode, "mine");
    assert.equal(d.status, "Preview");
    assert.equal(d.phoneSheet, null);
    assert.equal(d.useCustomPalette, false);
    assert.equal(d.customPalette, null);
    // Missing contentMode must not flip back to demo.
    assert.equal(parseMaisonChoices({ screen: "gallery" }).contentMode, "mine");
    assert.equal(parseMaisonChoices({ contentMode: "demo" }).contentMode, "demo");
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

  it("AUD-023: gallery + Preview is not resumable; detail is", () => {
    assert.equal(isMaisonSetupResumable(defaultMaisonChoices()), false);
    assert.equal(
      isMaisonSetupResumable(
        parseMaisonChoices({ screen: "detail", status: "Choices saved", paletteKey: "lilac" }),
      ),
      true,
    );
    assert.equal(
      isMaisonSetupResumable(parseMaisonChoices({ screen: "review", status: "Draft saved" })),
      true,
    );
  });

  it("AUD-023: resume summary matches Maison · palette · status", () => {
    const choices = parseMaisonChoices({
      screen: "detail",
      paletteKey: "lilac",
      status: "Choices saved",
    });
    assert.equal(
      maisonResumeSummaryLine(choices, "en"),
      "Maison · Lilac & Plum · Choices saved",
    );
    assert.match(maisonResumeSummaryLine(choices, "es"), /Elecciones guardadas/);
  });
});
