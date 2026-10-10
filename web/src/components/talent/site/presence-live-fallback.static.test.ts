/**
 * Live-site Change design / Apps must not no-op when Maison cohort is off.
 * Overlay chrome matches Maison setup; Apps → design stays in the overlay.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src/components/talent/site");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("live fallback mounts when Maison bootstrap settles off with a forced screen", () => {
  const mgr = read("TalentMaxSiteManager.tsx");
  assert.match(mgr, /maisonBootstrapSettled/);
  assert.match(mgr, /setLiveFallback\("apps"\)/);
  assert.match(mgr, /setLiveFallback\("gallery"\)/);
  assert.match(mgr, /PresenceLiveFallback/);
  const fallback = read("PresenceLiveFallback.tsx");
  assert.match(fallback, /data-testid="presence-live-fallback"/);
  assert.match(fallback, /ManagerThemeGallery/);
  assert.match(fallback, /AppsLibraryScreen/);
});

test("TUL-325: manager gallery applySuccess wires Publish CTA", () => {
  const mgr = read("TalentMaxSiteManager.tsx");
  assert.match(mgr, /onPublish=\{handlePublish\}/);
  const gallery = read("theme-gallery/ThemeGallery.tsx");
  assert.match(gallery, /data-theme-gallery-apply-success/);
  assert.match(gallery, /data-theme-gallery-publish/);
  assert.match(gallery, /data-theme-gallery-unpublished/);
  const i18n = read("theme-gallery/theme-gallery-i18n.ts");
  assert.match(i18n, /publishCta: "Publish site"/);
  assert.match(i18n, /publishCta: "Publicar sitio"/);
  assert.match(i18n, /unpublishedPill: "Unpublished changes"/);
  assert.doesNotMatch(i18n, /—/);
  const fallback = read("PresenceLiveFallback.tsx");
  assert.match(fallback, /onPublish=\{handlePublish\}/);
  assert.match(fallback, /publishMaxSiteAction/);
  const card = read("maison-setup/MyWebsiteCard.tsx");
  assert.match(card, /maison-live-publish/);
  assert.match(card, /publishMaxSiteAction/);
  assert.match(card, /Publish site/);
});

test("TUL-329: cohort-off fallback uses MaisonSetupOverlay chrome", () => {
  const fallback = read("PresenceLiveFallback.tsx");
  assert.match(fallback, /MaisonSetupOverlay/);
  assert.match(fallback, /from "@\/components\/talent\/site\/maison-setup\/MaisonSetupOverlay"/);
  // Thin sticky Close bar is gone; gallery uses Maison Today / ✕ chrome.
  assert.doesNotMatch(fallback, /sticky top-0/);
  assert.doesNotMatch(fallback, /fixed inset-0 z-\[320\]/);
  assert.match(fallback, /presence-live-fallback-close/);
  assert.match(fallback, /maisonSetupT\(maisonLocale, "Today"\)/);
});

test("TUL-329: Apps → design keeps overlay open (gallery view, not onClose)", () => {
  const fallback = read("PresenceLiveFallback.tsx");
  assert.match(fallback, /onOpenDesign=\{\(\) => \{/);
  assert.match(fallback, /setView\(\{ kind: "gallery" \}\)/);
  // Must not close the overlay from onOpenDesign (the G10 bug).
  const onOpenBlock = fallback.match(
    /onOpenDesign=\{\(\) => \{([\s\S]*?)\}\}/,
  );
  assert.ok(onOpenBlock, "onOpenDesign handler present");
  assert.doesNotMatch(onOpenBlock[1]!, /\bonClose\b/);
});
