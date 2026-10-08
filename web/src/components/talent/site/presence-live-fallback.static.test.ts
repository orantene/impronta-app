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
