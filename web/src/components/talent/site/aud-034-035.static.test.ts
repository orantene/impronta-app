/**
 * AUD-034 (one design gallery on /talent/site) and AUD-035 (builder canvas
 * shows reveal-lane content at final state) contracts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EDITOR_CANVAS_REVEAL_CSS,
  EDITOR_CANVAS_SCOPE,
} from "./editor-canvas-reveal-css";

const ROOT = join(process.cwd(), "src/components/talent/site");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("AUD-034: Maison flag on hides the legacy starter-template gallery", () => {
  const mgr = read("TalentMaxSiteManager.tsx");
  assert.match(mgr, /setMaisonSetupEnabled\(enabled\)/);
  assert.match(mgr, /PresenceLiveFallback/);
  assert.match(
    mgr,
    /\{hostHidden \|\| maisonSetupEnabled \? null : \(\s*<>\s*<ManagerThemeGallery/,
  );
  // Flag off: default false keeps the legacy gallery unchanged.
  assert.match(mgr, /const \[maisonSetupEnabled, setMaisonSetupEnabled\] = useState\(false\)/);
  const host = read("maison-setup/MaisonSetupHost.tsx");
  assert.match(host, /setEnabled\(false\);\s*reportEnabled\(false\);/);
  assert.match(host, /setEnabled\(true\);\s*reportEnabled\(true\);/);
});

test("AUD-035: editor canvas forces final state for both scroll lanes", () => {
  assert.equal(EDITOR_CANVAS_SCOPE, "[data-talent-page-builder-screen]");
  assert.ok(EDITOR_CANVAS_REVEAL_CSS.includes("[data-bn-anim-once]:not([data-bn-revealed])"));
  assert.ok(EDITOR_CANVAS_REVEAL_CSS.includes("[data-bn-reveal]:not([data-bn-revealed])"));
  assert.ok(EDITOR_CANVAS_REVEAL_CSS.includes("opacity:1"));
  // Not !important, so Motion replay keyframes still play in the editor.
  assert.equal(EDITOR_CANVAS_REVEAL_CSS.includes("!important"), false);
  // Every selector is editor-scoped (public site untouched).
  const selectors = EDITOR_CANVAS_REVEAL_CSS.split("{")[0].split(",");
  for (const s of selectors) assert.ok(s.startsWith(EDITOR_CANVAS_SCOPE), s);
  assert.match(read("TalentPageBuilderScreen.tsx"), /<style>\{EDITOR_CANVAS_REVEAL_CSS\}<\/style>/);
  const renderer = readFileSync(
    join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"),
    "utf8",
  );
  assert.equal(renderer.includes("data-talent-page-builder-screen"), false);
});
