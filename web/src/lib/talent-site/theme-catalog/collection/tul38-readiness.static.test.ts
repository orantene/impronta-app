/**
 * TUL-38 as data/config (approved plan #3961): the committed workbook map
 * already carries every demo with its workbook theme, and the planner maps a
 * workbook theme to the design slug of the same name. This pins the readiness
 * facts so applying stays a separate, human step after QA:
 *   - every code design (draft or finished) has its 7 mapped demos;
 *   - assignment only ever touches FINISHED designs, so the 5 new drafts and
 *     solace/mono/frame stay "queued until theme finished";
 *   - no forbidden profile code is in the map.
 * Reads the map file only. No database, no writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { FINISHED_GALLERY_SLUGS } from "../gallery-meta";
import { COLLECTION_DESIGNS } from "./designs";

type MapFile = {
  workbookThemeToDesign: Record<string, string>;
  entries: Array<{ profileCode: string; siteSlug: string | null; workbookTheme: string }>;
};

const map = JSON.parse(readFileSync(join(process.cwd(), "scripts", "demo-talents", "demo-theme-map.json"), "utf8")) as MapFile;
const slugFor = (theme: string) => map.workbookThemeToDesign[theme] ?? theme.trim().toLowerCase().replace(/\s+/g, "-");
const demosByDesign = new Map<string, number>();
for (const e of map.entries) demosByDesign.set(slugFor(e.workbookTheme), (demosByDesign.get(slugFor(e.workbookTheme)) ?? 0) + 1);

describe("TUL-38 readiness (data only)", () => {
  it("every code design has its 7 workbook demos queued", () => {
    for (const d of COLLECTION_DESIGNS) {
      assert.equal(demosByDesign.get(d.slug) ?? 0, 7, `${d.slug} should have 7 mapped demos`);
    }
  });
  it("only the finished designs are assignable today; the drafts wait", () => {
    const drafts = COLLECTION_DESIGNS.map((d) => d.slug).filter((s) => !(FINISHED_GALLERY_SLUGS as readonly string[]).includes(s));
    assert.deepEqual([...drafts].sort(), ["clarity", "frame", "mono", "mosaic", "prism", "ribbon", "solace", "table"]);
  });
  it("never lists a forbidden profile code (Jorgelina, QA twin)", () => {
    const codes = map.entries.map((e) => e.profileCode);
    for (const bad of ["TAL-93938", "TAL-93900", "TAL-93901", "TAL-93939"]) assert.ok(!codes.includes(bad), bad);
  });
  it("no workbook theme maps to Maison v1", () => {
    assert.ok(!Object.values(map.workbookThemeToDesign).includes("maison"));
  });
});
