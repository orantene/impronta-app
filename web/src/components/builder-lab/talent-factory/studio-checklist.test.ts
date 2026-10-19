import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { STUDIO_COPY } from "./studio-checklist-copy";
import { buildStudioChecklist, studioFlagOn, type StudioFacts } from "./studio-checklist";

const FULL: StudioFacts = {
  packFiles: ["index.html", "kit.js", "parity-map.json", "content.json", "README.md"],
  readmeDraft: false,
  referenceDemoCode: "TAL-93011",
  openDeltas: 0,
  gaps: [],
  overlayPresent: true,
  galleryVisible: true,
};

describe("buildStudioChecklist", () => {
  it("is ready when every row passes", () => {
    const c = buildStudioChecklist(FULL);
    assert.equal(c.ready, true);
    assert.deepEqual(c.rows.map((r) => r.key), ["pack", "demo", "parity", "gaps", "overlay", "gallery"]);
    assert.ok(c.rows.every((r) => r.ok));
  });
  it("a pack with missing files is not complete", () => {
    const c = buildStudioChecklist({ ...FULL, packFiles: ["index.html", "kit.js"] });
    const row = c.rows.find((r) => r.key === "pack")!;
    assert.equal(row.ok, false);
    assert.match(row.detail ?? "", /parity-map\.json/);
    assert.equal(c.ready, false);
  });
  it("a README that still says DRAFT blocks the pack row", () => {
    assert.equal(buildStudioChecklist({ ...FULL, readmeDraft: true }).rows[0]!.ok, false);
  });
  it("unknown parity (no local run) is not ok, open deltas are not ok", () => {
    assert.equal(buildStudioChecklist({ ...FULL, openDeltas: null }).rows.find((r) => r.key === "parity")!.ok, false);
    assert.equal(buildStudioChecklist({ ...FULL, openDeltas: 2 }).rows.find((r) => r.key === "parity")!.ok, false);
  });
  it("an open capability gap blocks and is named in the detail", () => {
    const c = buildStudioChecklist({ ...FULL, gaps: ["W-12 contact sheet tag filter and loupe"] });
    const row = c.rows.find((r) => r.key === "gaps")!;
    assert.equal(row.ok, false);
    assert.match(row.detail ?? "", /W-12/);
  });
  it("missing reference demo, overlay, or gallery decision each block", () => {
    assert.equal(buildStudioChecklist({ ...FULL, referenceDemoCode: null }).ready, false);
    assert.equal(buildStudioChecklist({ ...FULL, overlayPresent: false }).ready, false);
    assert.equal(buildStudioChecklist({ ...FULL, galleryVisible: false }).ready, false);
  });
});

describe("studioFlagOn", () => {
  it("is off unless TALENT_THEME_STUDIO is exactly 1", () => {
    assert.equal(studioFlagOn({}), false);
    assert.equal(studioFlagOn({ TALENT_THEME_STUDIO: "0" }), false);
    assert.equal(studioFlagOn({ TALENT_THEME_STUDIO: "1" }), true);
  });
});

describe("STUDIO_COPY", () => {
  it("has EN and ES for every row key, no em dashes", () => {
    for (const lang of ["en", "es"] as const) {
      for (const k of ["pack", "demo", "parity", "gaps", "overlay", "gallery"] as const) {
        assert.ok(STUDIO_COPY[lang].rows[k].length > 0);
      }
      assert.ok(!JSON.stringify(STUDIO_COPY[lang]).includes("—"));
    }
    assert.notEqual(STUDIO_COPY.en.title, STUDIO_COPY.es.title);
  });
});
