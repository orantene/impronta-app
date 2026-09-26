/**
 * Maison setup static contracts (PR4–PR5): W75, flag gate, tags, sheets,
 * Use this design → applyMaisonDesignAction, Review/Publish chrome, W72.
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

test("W35: Use this design calls applyMaisonDesignAction (no confirm table)", () => {
  const detail = read("ThemeDetailScreen.tsx");
  assert.match(detail, /maison-use-design/);
  assert.match(detail, /applyMaisonDesignAction/);
  assert.match(detail, /no summary\/confirm table/);
  assert.equal(/applySiteDesignAction/.test(detail), false);
  assert.equal(/confirm.*replace/i.test(detail), false);
});

test("W37–W42: Review + Publish + failure banner wired", () => {
  const review = read("ReviewWebsiteScreen.tsx");
  assert.match(review, /data-testid="maison-review"/);
  assert.match(review, /maison-readiness/);
  assert.match(review, /publishMaxSiteAction/);
  assert.match(review, /maison-publish-failure/);
  assert.match(review, /maison-undo-design/);
  assert.match(review, /No trial, plan, or price/);
});

test("W40: My website card has Live + View / Change / Design options", () => {
  const card = read("MyWebsiteCard.tsx");
  assert.match(card, /maison-my-website-card/);
  assert.match(card, /maison-view-website/);
  assert.match(card, /maison-change-design/);
  assert.match(card, /maison-design-options/);
  assert.match(card, /● Live/);
});

test("manager mounts MaisonSetupHost ahead of theme gallery", () => {
  const manager = readFileSync(
    join(process.cwd(), "src/components/talent/site/TalentMaxSiteManager.tsx"),
    "utf8",
  );
  assert.match(manager, /MaisonSetupHost/);
  assert.match(manager, /next\/dynamic/);
  assert.match(manager, /maison-setup\/MaisonSetupHost/);
  assert.match(manager, /MyWebsiteCard/);
  const maisonIdx = manager.indexOf("<MaisonSetupHost");
  const galleryIdx = manager.indexOf("<ManagerThemeGallery");
  assert.ok(maisonIdx > 0 && galleryIdx > maisonIdx);
});

test("apply actions are Maison-flag gated", () => {
  const apply = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/maison-apply-actions.ts"),
    "utf8",
  );
  assert.match(apply, /isTalentMaisonThemeEnabled/);
  assert.match(apply, /feature_disabled/);
  assert.match(apply, /pending_design/);
  assert.match(apply, /captureMaisonDraftSnapshot/);
});

test("publishMaxSiteAction gates on Maison readiness when flag on", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/site-management-actions.ts"),
    "utf8",
  );
  assert.match(src, /evaluateMaisonPublishReadiness/);
  assert.match(src, /readiness_blocked/);
  assert.match(src, /writeMaisonDesignPublishedRevision/);
  assert.match(src, /isTalentMaisonThemeEnabled/);
});

test("W60–W65: Custom colors panel + Theme detail entry (no placeholder alert)", () => {
  const panel = read("CustomColorsPanel.tsx");
  assert.match(panel, /data-testid="maison-custom-colors-panel"/);
  assert.match(panel, /maison-custom-field-\$\{meta\.key\}/);
  assert.match(panel, /key: "page"/);
  assert.match(panel, /key: "text"/);
  assert.match(panel, /key: "accent"/);
  assert.match(panel, /key: "section"/);
  assert.match(panel, /maison-contrast-advisory/);
  assert.match(panel, /maison-contrast-preview-suggestion/);
  assert.match(panel, /maison-contrast-use-adjustment/);
  assert.match(panel, /enterKeyHint="done"/);
  assert.match(panel, /maison-custom-kbd-strip/);
  const detail = read("ThemeDetailScreen.tsx");
  assert.match(detail, /CustomColorsPanel/);
  assert.match(detail, /openCustomColors/);
  assert.equal(/Custom colors open in a later step/.test(detail), false);
});

test("W66: Review summary uses My colors when custom_palette applied", () => {
  const review = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/maison-review-actions.ts"),
    "utf8",
  );
  assert.match(review, /customPalette/);
  assert.match(review, /buildSummaryLine/);
  assert.match(review, /My colors|customPalette\.name/);
});
