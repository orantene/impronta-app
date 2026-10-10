import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { editorT } from "./editor-i18n";

const DRAWER = join(process.cwd(), "src/components/edit-chrome/publish-drawer.tsx");
const PREFLIGHT = join(process.cwd(), "src/components/edit-chrome/PublishPreflight.tsx");

test("TUL-81: publish drawer wraps missing-section + save banners in t()", () => {
  const src = readFileSync(DRAWER, "utf8");
  assert.match(src, /t\("Add at least one section to"\)/);
  assert.match(src, /t\("before publishing\."\)/);
  assert.match(src, /t\("Saving your last edit…"\)/);
  assert.match(src, /t\("You have unsaved edits\. Wait for them to save first\."\)/);
  assert.doesNotMatch(src, /^\s*Add at least one section to/m);
});

test("TUL-81: PublishPreflight localises every issue message", () => {
  const src = readFileSync(PREFLIGHT, "utf8");
  assert.match(src, /localisePublishPreflightMessage\(issue\.message/);
  assert.doesNotMatch(
    src,
    /issue\.category === "brand_identity".*\? t\(issue\.message\) : issue\.message/,
  );
});

test("TUL-81: Spanish catalogue covers drawer banner keys", () => {
  assert.equal(
    editorT("Add at least one section to", "es"),
    "Agrega al menos una sección a",
  );
  assert.equal(editorT("before publishing.", "es"), "antes de publicar.");
  assert.notEqual(editorT(" (Free publish policy)", "es"), " (Free publish policy)");
});
