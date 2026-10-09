/**
 * Live-site Change design / Apps must not no-op when Maison cohort is off.
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
