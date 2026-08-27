import { test } from "node:test";
import assert from "node:assert/strict";

import { toWinAnsiSafe } from "./media-kit-pdf";

/**
 * pdf-lib's StandardFonts are WinAnsi-encoded and `drawText` THROWS on any
 * character the encoding cannot represent — it does not drop it silently.
 * Without sanitising, a talent whose display name is Cyrillic or CJK would
 * 500 the entire media-kit download instead of getting a slightly wrong PDF.
 *
 * Verified against pdf-lib directly before writing this: "Анна Петрова" raises
 * `WinAnsi cannot encode "А" (0x0410)`.
 */

test("preserves the Latin set the product actually ships in", () => {
  // EN/ES is the live language pair, so the Spanish alphabet must survive
  // BYTE-IDENTICALLY — degrading an accent here would be a visible regression
  // on the majority of real profiles.
  for (const name of [
    "Sofia Mendez",
    "Bailarín Nocturno",
    "Compañía de Baile",
    "Müller",
    "Ana Sofía Núñez",
  ]) {
    assert.equal(toWinAnsiSafe(name), name, `${name} must pass through unchanged`);
  }
});

test("degrades unrepresentable scripts instead of throwing", () => {
  const cyrillic = toWinAnsiSafe("Анна Петрова");
  const cjk = toWinAnsiSafe("田中さくら");

  // The exact placeholder is not the contract; not crashing is.
  assert.ok(cyrillic.length >= 0);
  assert.ok(cjk.length >= 0);
  assert.doesNotMatch(cyrillic, /[Ѐ-ӿ]/, "Cyrillic must not survive");
  assert.doesNotMatch(cjk, /[　-鿿]/, "CJK must not survive");
});

test("keeps the Latin part of a mixed-script name readable", () => {
  const mixed = toWinAnsiSafe("DJ 田中 Sofia");
  assert.match(mixed, /DJ/);
  assert.match(mixed, /Sofia/);
  assert.doesNotMatch(mixed, /[　-鿿]/);
});

test("collapses runs of placeholders rather than emitting a wall of them", () => {
  assert.doesNotMatch(toWinAnsiSafe("さくらさくらさくら"), /\?{2,}/);
});

test("is a no-op on empty and plain-ASCII input", () => {
  assert.equal(toWinAnsiSafe(""), "");
  assert.equal(toWinAnsiSafe("Studio 54"), "Studio 54");
});
