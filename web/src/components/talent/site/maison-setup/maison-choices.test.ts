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

  it("uses a stable storage prefix", () => {
    assert.equal(MAISON_CHOICES_STORAGE_PREFIX, "maison-setup-choices:");
  });
});
