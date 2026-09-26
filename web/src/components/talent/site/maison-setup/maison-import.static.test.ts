/**
 * PR6 Import static contracts (W44–W59).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src/components/talent/site/maison-setup");

test("W44: Theme detail opens ImportStarterPanel (not a later-step alert)", () => {
  const detail = readFileSync(join(ROOT, "ThemeDetailScreen.tsx"), "utf8");
  assert.match(detail, /ImportStarterPanel/);
  assert.match(detail, /maison-import-entry/);
  assert.equal(/Import opens in a later step/.test(detail), false);
});

test("W45–W47: Import panel groups + no images group for preview-only", () => {
  const panel = readFileSync(join(ROOT, "ImportStarterPanel.tsx"), "utf8");
  assert.match(panel, /maison-import-group-services/);
  assert.match(panel, /maison-import-group-faqs/);
  assert.match(panel, /maison-import-group-sections/);
  assert.match(panel, /maison-import-preview-only-note/);
  assert.equal(/maison-import-group-images/.test(panel), false);
  assert.match(panel, /group-services-check/);
  assert.match(panel, /group-services-chevron/);
});

test("W52–W59: review duplicates, commit, undo, retry, services banner link", () => {
  const panel = readFileSync(join(ROOT, "ImportStarterPanel.tsx"), "utf8");
  assert.match(panel, /commitMaisonImportAction/);
  assert.match(panel, /undoMaisonImportAction/);
  assert.match(panel, /retryMaisonImportItemAction/);
  assert.match(panel, /keep_existing/);
  assert.match(panel, /add_as_draft/);
  assert.match(panel, /from=website-setup/);
  assert.match(panel, /maison-import-undo/);
});

test("import actions are Maison-flag gated", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/maison-import-actions.ts"),
    "utf8",
  );
  assert.match(src, /isTalentMaisonThemeEnabled/);
  assert.match(src, /feature_disabled/);
});

test("W59: Services website-setup banner", () => {
  const banner = readFileSync(
    join(process.cwd(), "src/components/talent/services/ServicesWebsiteSetupBanner.tsx"),
    "utf8",
  );
  assert.match(banner, /from=website-setup|website-setup/);
  assert.match(banner, /Back to website setup|Volver a la configuración/);
  const home = readFileSync(
    join(process.cwd(), "src/components/talent/services/ServicesHome.tsx"),
    "utf8",
  );
  assert.match(home, /ServicesWebsiteSetupBanner/);
});
