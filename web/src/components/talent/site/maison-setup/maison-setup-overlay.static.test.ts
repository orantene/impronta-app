/**
 * "Change design" on a live site opens the picker as an overlay, not as a
 * block in the page flow (which scrolled the window ~650px and left a blank
 * band). Platform fix: one overlay wraps the gallery, theme detail and review.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = join(process.cwd(), "src/components/talent/site/maison-setup");
const read = (f: string) => readFileSync(join(dir, f), "utf8");

test("the overlay is fixed, scroll-locked, focus-trapped, modal and closes on Escape", () => {
  const src = read("MaisonSetupOverlay.tsx");
  assert.match(src, /fixed inset-0/);
  assert.match(src, /document\.body\.style\.overflow = "hidden"/);
  assert.match(src, /useFocusTrap/);
  assert.match(src, /aria-modal="true"/);
  assert.match(src, /e\.key === "Escape"/);
  assert.match(src, /createPortal/);
});

test("on a live site the host renders every screen inside the overlay; first-time setup stays inline", () => {
  const src = read("MaisonSetupHost.tsx");
  assert.match(src, /if \(siteLive\) \{[\s\S]*<MaisonSetupOverlay[\s\S]*\{body\}[\s\S]*<\/MaisonSetupOverlay>/);
  assert.match(src, /className="mb-6">\s*\{body\}/);
});

test("the gallery restores and saves scroll on the overlay, not the window, when it is open", () => {
  const src = read("GalleryBrowseScreen.tsx");
  assert.match(src, /\[data-maison-setup-overlay\]/);
});

test("no hex colours or em dashes in the overlay", () => {
  const src = read("MaisonSetupOverlay.tsx");
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
  assert.ok(!src.includes("—"));
});
