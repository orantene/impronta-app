/**
 * The Share popover's contract, checked without a browser.
 *
 * Agents do not browser-QA in this repo, and most of what matters here is not
 * visual: that every visible string has a Spanish translation, that no button
 * promises something that does not exist, and that the Instagram control does
 * not pretend to have a share URL.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(here, "ShareLinkPopover.tsx"), "utf8");
const i18n = readFileSync(
  join(here, "../admin/shell/internal/dashboard-i18n.ts"),
  "utf8",
);

/** Every `copy.t("...")` literal the component renders. */
function translatedStrings(src: string): string[] {
  return [...src.matchAll(/copy\.t\("((?:[^"\\]|\\.)+)"\)/g)].map((m) => m[1]!);
}

test("every visible string has a Spanish translation", () => {
  const missing = translatedStrings(component).filter(
    (s) => !i18n.includes(`"${s}":`),
  );
  assert.deepEqual(missing, [], `no Spanish for: ${missing.join(", ")}`);
});

test("the component renders at least the strings we expect it to", () => {
  // Guards the test above from passing vacuously if copy.t() were refactored
  // away and the extraction quietly returned nothing.
  const found = translatedStrings(component);
  assert.ok(found.length >= 10, `only found ${found.length} translated strings`);
  for (const expected of ["Tracked link", "Design it", "Print PDF"]) {
    assert.ok(found.includes(expected), `expected the component to render "${expected}"`);
  }
});

test("no user-facing string contains an em dash", () => {
  for (const s of translatedStrings(component)) {
    assert.ok(!s.includes("—"), `em dash in ${JSON.stringify(s)}`);
  }
});

test("the unbuilt print designer is disabled, not merely styled to look disabled", () => {
  // The sibling PR removed two buttons from the publish screen that promised a
  // QR and a PDF and only fired a toast. Shipping another lit-but-dead button
  // here would be the same broken promise in a new place.
  assert.match(component, /disabled/, "the Design it templates must be disabled");
  assert.match(component, /Coming soon/, "and must say why");
});

test("Instagram does not pretend to have a share URL", () => {
  // instagramHref() returns null on purpose; the control copies instead.
  assert.doesNotMatch(component, /instagram\.com\/\?/, "no invented Instagram share URL");
  assert.match(component, /paste it into your Story/, "tells the user what to do instead");
});

test("the QR is requested as SVG, so it stays sharp at any size", () => {
  assert.match(component, /qrAssetHref\(code, "svg"\)/);
});

test("the code image has an alt that names the link", () => {
  assert.match(component, /alt=\{copy\.t\("QR code for \{name\}"\)/);
});
