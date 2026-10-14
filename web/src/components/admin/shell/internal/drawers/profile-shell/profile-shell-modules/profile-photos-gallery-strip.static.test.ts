/**
 * TUL-480 / TUL-519 — GalleryStrip must keep a labeled "Add photos"
 * affordance after the first gallery upload. QA harnesses look for that
 * string in the Medios section; the empty-state-only CTA hid it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(
  __dirname,
  "profile-photos.tsx",
);

function galleryStripSource(): string {
  const full = readFileSync(SRC, "utf8");
  const start = full.indexOf("export function GalleryStrip(");
  assert.ok(start >= 0, "GalleryStrip export present");
  const next = full.indexOf("\nexport function ", start + 1);
  return next >= 0 ? full.slice(start, next) : full.slice(start);
}

test("GalleryStrip keeps copy.t(\"Add photos\") outside the empty-only branch", () => {
  const body = galleryStripSource();
  const emptyBranch = body.indexOf("if (totalCount === 0)");
  assert.ok(emptyBranch >= 0, "empty branch present");
  // First return closes the empty CTA; everything after must still label add.
  const afterEmpty = body.slice(emptyBranch);
  const filledReturn = afterEmpty.indexOf("return (", afterEmpty.indexOf("return (") + 1);
  assert.ok(filledReturn > 0, "filled-state return present");
  const filled = afterEmpty.slice(filledReturn);
  assert.ok(
    filled.includes('copy.t("Add photos")'),
    "filled strip must render Add photos / Agregar fotos",
  );
  assert.ok(
    filled.includes("data-pshell-gallery-add"),
    "filled strip keeps the stable add hook",
  );
});

test("GalleryStrip reserves a cell for the add tile when photos exist", () => {
  const body = galleryStripSource();
  assert.ok(body.includes("thumbBudget"), "thumb budget leaves room for add tile");
  assert.ok(body.includes("MAX_CELLS"), "shared cell budget");
});
