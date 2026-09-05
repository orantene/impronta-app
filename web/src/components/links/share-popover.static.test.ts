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

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const here = dirname(fileURLToPath(import.meta.url));
/**
 * Comments blanked before any source match, using the repo's own helper.
 *
 * `assert.match(component, /disabled/)` is satisfied by a COMMENT containing
 * the word — so the assertion would keep passing after someone removed the
 * attribute and left the explanation behind. `guard-reads-source` exists for
 * exactly this shape and it caught this file; `blankComments` is the fix it
 * names, and it is string-aware, which a regex over `//` is not.
 */
const component = blankComments(readFileSync(join(here, "ShareLinkPopover.tsx"), "utf8"));
// Spanish now lives in a module of its own; read both so the check does not
// silently pass by looking only where the strings used to be.
const i18n =
  readFileSync(join(here, "../admin/shell/internal/dashboard-i18n.ts"), "utf8") +
  readFileSync(join(here, "../admin/shell/internal/dashboard-i18n-links.ts"), "utf8");

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
  // The attribute on a real element, not the word anywhere in the file.
  // No `s` flag: this project targets ES2017 and dotAll needs ES2018 (TS1501).
  // It was never needed anyway — `[^>]*` is a negated class and already spans
  // newlines; `s` only changes what `.` matches, and there is no `.` here.
  assert.match(component, /<button[^>]*\bdisabled\b/, "the Design it templates must carry the disabled attribute");
  assert.match(component, /copy\.t\("Coming soon\./, "and must say why, as a rendered string");
});

test("Instagram does not pretend to have a share URL", () => {
  // instagramHref() returns null on purpose; the control copies instead.
  assert.doesNotMatch(component, /instagram\.com\/\?/, "no invented Instagram share URL");
  assert.match(component, /copy\.t\("Copy the link, then paste it into your Story"\)/, "tells the user what to do instead");
});

test("the QR is requested as SVG, so it stays sharp at any size", () => {
  assert.match(component, /qrAssetHref\(active\.code, "svg"\)/);
});

test("the code image has an alt that names the link", () => {
  assert.match(component, /alt=\{copy\.t\("QR code for \{name\}"\)/);
});

// ── The unminted state (#1798) ──────────────────────────────────────────────
//
// A thing gets its link on FIRST SHARE. An earlier version of this component
// required `code` and `url`, which deadlocked that: the popover could only open
// for a subject that already had a link, and a link only existed after a first
// share — so nothing could ever be shared for the first time.

test("the popover accepts a subject with NO link yet", () => {
  // `link: ... | null` rather than required code/url. Null is the normal first
  // state of every subject in the product, not an error.
  assert.match(component, /link:\s*\{[^}]*\}\s*\|\s*null/s, "link must be nullable");
  assert.doesNotMatch(component, /^\s*code:\s*string;\s*$/m, "code must not be a required prop");
  assert.doesNotMatch(component, /^\s*url:\s*string;\s*$/m, "url must not be a required prop");
});

test("the mint is asked for by THIS component, not performed by the mount", () => {
  // Mounts write no `links` row; they hand over a bound action. Six areas each
  // inventing a code policy is what that instruction prevents.
  assert.match(component, /onMint\?:\s*\(\)\s*=>\s*Promise</);
});

test("a viewer with no mint action is told, not shown a button that would fail", () => {
  assert.match(component, /Ask someone who can edit this workspace to create it/);
});

test("a failed mint says what happened", () => {
  // A silent failure leaves the operator clicking a button that appears to do
  // nothing, with the thing still unshared.
  assert.match(component, /setMintError/);
  assert.match(component, /role="alert"/);
});

test("the freshly minted link wins over the stale server value", () => {
  // `link` is what the server knew when the popover opened; after a first share
  // it is stale. Rendering it would show "not shared yet" next to a live code.
  assert.match(component, /minted\s*\?\?\s*link/);
});
