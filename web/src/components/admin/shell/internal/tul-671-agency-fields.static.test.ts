/**
 * TUL-671: "Campos de agencia" stuck on "Cargando..." with debug copy.
 *
 * Root cause: the panel calls `getFieldsForTalent`, a STAFF-only action, and
 * the talent's own editor (mode "edit-self") still listed the section. The
 * call can only fail for a talent, and the panel had no rejection handler,
 * so `loading` never cleared. The section is a back-office diagnostic: it
 * must not be offered to the talent, and the panel must always settle.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const DIR = __dirname;
const drawer = readFileSync(
  path.join(DIR, "drawers/profile-shell/TalentProfileShellDrawer.tsx"),
  "utf8",
);
const panel = readFileSync(
  path.join(DIR, "drawers/profile-shell/profile-shell-modules/truth-preview.tsx"),
  "utf8",
);
const i18n = readFileSync(path.join(DIR, "dashboard-i18n.ts"), "utf8");

describe("TUL-671 Agency Fields is staff-only and always settles", () => {
  it("rail visibility hides agency_fields from the talent (edit-self)", () => {
    assert.match(
      drawer,
      /s === "agency_fields" && \(!newEngineActive \|\| !adminVisible\)\) return false/,
    );
  });

  it("pill nav hides agency_fields from the talent too", () => {
    assert.match(
      drawer,
      /s === "agency_fields" && !adminVisible\) return null/,
    );
  });

  it("the panel body only mounts for staff", () => {
    assert.match(drawer, /activeSection === "agency_fields" && adminVisible/);
  });

  it("the panel handles a rejected/throwing action instead of loading forever", () => {
    assert.match(panel, /getFieldsForTalent\(\{ talent_profile_id: talentProfileId \}\)[\s\S]{0,400}\.catch\(/);
  });

  it("no debug copy ('DB-resolved') is shown to anyone", () => {
    assert.doesNotMatch(panel, /DB-resolved field catalog/);
    assert.doesNotMatch(i18n, /Cat.logo de campos resuelto desde la DB/);
  });
});
