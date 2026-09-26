/**
 * PR4 static contracts: no search/filters (W75), flag gate, tag kinds (W26),
 * one phone sheet at a time (W34), Use-this-design chrome without apply (PR5).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { maisonTagChipClassHint, maisonTagKind } from "./MaisonTagChips";

const ROOT = join(process.cwd(), "src/components/talent/site/maison-setup");

function read(name: string): string {
  return readFileSync(join(ROOT, name), "utf8");
}

test("W75: Choose a design has no search or filter controls", () => {
  const src = read("ChooseDesignScreen.tsx");
  assert.match(src, /data-maison-choose-design/);
  assert.match(src, /no search input and no filter chips/);
  assert.equal(/type=["']search["']/.test(src), false);
  assert.equal(/placeholder=\{?["'].*Search/.test(src), false);
  assert.equal(/filter/i.test(src) && /<input/.test(src), false);
});

test("W26: Maison tags map style→outlined and layout→filled", () => {
  assert.equal(maisonTagKind("editorial"), "style");
  assert.equal(maisonTagKind("warm"), "style");
  assert.equal(maisonTagKind("menu"), "layout");
  assert.equal(maisonTagKind("booking"), "layout");
  assert.equal(maisonTagKind("portfolio"), "layout");
  assert.equal(maisonTagChipClassHint("style"), "outlined");
  assert.equal(maisonTagChipClassHint("layout"), "filled");
  const chips = read("MaisonTagChips.tsx");
  assert.match(chips, /data-maison-tag-kind/);
});

test("bootstrap is Maison-flag gated", () => {
  const boot = read("maison-setup-bootstrap.ts");
  assert.match(boot, /isTalentMaisonThemeEnabled/);
  assert.match(boot, /enabled: false/);
  assert.match(boot, /personalSiteEdit/);
});

test("host renders nothing when flag/bootstrap is off", () => {
  const host = read("MaisonSetupHost.tsx");
  assert.match(host, /enabled !== true/);
  assert.match(host, /return null/);
});

test("W34: phone sheets are mutually exclusive state", () => {
  const detail = read("ThemeDetailScreen.tsx");
  assert.match(detail, /phoneSheet/);
  assert.match(detail, /data-maison-phone-sheet/);
  // Opening one sheet replaces the other via single phoneSheet field.
  assert.match(detail, /openSheet\("demos"\)/);
  assert.match(detail, /openSheet\("colors"\)/);
});

test("W30–W32: Demo|My content, status words, five palettes", () => {
  const detail = read("ThemeDetailScreen.tsx");
  assert.match(detail, /maison-mode-\$\{mode\}/);
  assert.match(detail, /\(\["demo", "mine"\]/);
  assert.match(detail, /maison-status-word/);
  assert.match(detail, /MAISON_PALETTE_ORDER/);
  assert.match(detail, /Choices saved/);
});

test("Use this design is chrome-only in PR4 (no applySiteDesignAction)", () => {
  const detail = read("ThemeDetailScreen.tsx");
  assert.match(detail, /maison-use-design/);
  assert.equal(/applySiteDesignAction/.test(detail), false);
  assert.equal(/applySiteLookAction/.test(detail), false);
});

test("manager mounts MaisonSetupHost ahead of theme gallery", () => {
  const manager = readFileSync(
    join(process.cwd(), "src/components/talent/site/TalentMaxSiteManager.tsx"),
    "utf8",
  );
  assert.match(manager, /MaisonSetupHost/);
  const maisonIdx = manager.indexOf("<MaisonSetupHost");
  const galleryIdx = manager.indexOf("<ManagerThemeGallery");
  assert.ok(maisonIdx > 0 && galleryIdx > maisonIdx);
});
