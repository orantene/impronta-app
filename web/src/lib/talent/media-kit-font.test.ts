import { test } from "node:test";
import assert from "node:assert/strict";

import { loadMediaKitTypeface, loadMediaKitTypefaceFrom } from "./media-kit-font";
import { generateTalentMediaKitPdf, toFontSafe, toWinAnsiSafe } from "./media-kit-pdf";
import type { TalentMediaKitModel } from "./media-kit-model";

/**
 * The media kit embeds a Latin + Greek + Cyrillic subset of Noto Sans (SIL OFL)
 * so a non-Latin display name renders instead of degrading to `?`. These tests
 * pin the three things that can silently rot:
 *
 *  1. the font file is still findable and parseable from `process.cwd()`,
 *  2. the scripts we claim to support really are in the file, and
 *  3. the scripts we do NOT support still degrade to a placeholder rather than
 *     to `.notdef` tofu — a custom font does not throw on a missing glyph the
 *     way WinAnsi Helvetica does, it just draws a blank box, so the coverage
 *     check is the only thing standing between a CJK name and an invisible one.
 */

const cp = (ch: string) => ch.codePointAt(0)!;

function model(displayName: string): TalentMediaKitModel {
  return {
    displayName,
    headline: "Contemporary dance · Europe",
    bio: "Ten years on stage.",
    primaryTypeLabel: "Dancer",
    talentTypeLabels: ["Dancer"],
    locationLabel: "Madrid, Spain",
    priceLabel: "From $500",
    headshotUrl: null,
    photos: [],
    profileUrl: "https://impronta.tulala.digital/t/example",
    profileCode: "EX-001",
    generatedAtISO: "2026-08-26T00:00:00.000Z",
    brandName: "Impronta",
    fileNameStem: "example-media-kit",
  };
}

test("the typeface loads from a plain cwd-relative path", async () => {
  const typeface = await loadMediaKitTypeface();
  assert.ok(typeface, "font files must resolve — see outputFileTracingIncludes in next.config.ts");
  assert.ok(typeface.regular.byteLength > 10_000);
  assert.ok(typeface.bold.byteLength > 10_000);
  // Coverage is intersected across both faces, so this is what BOTH can draw.
  assert.ok(typeface.coverage.size > 1_000, `coverage was ${typeface.coverage.size}`);
});

test("a font that did not ship returns null instead of throwing", async () => {
  // This is the branch that decides whether a bad deploy (tracing misconfigured,
  // files pruned) degrades to Helvetica or 500s the download. It must be a null,
  // never a rejection.
  assert.equal(await loadMediaKitTypefaceFrom([]), null);
  assert.equal(await loadMediaKitTypefaceFrom(["/definitely/not/a/font/dir"]), null);
  // A directory that exists but holds no usable font is the same story.
  assert.equal(await loadMediaKitTypefaceFrom([process.cwd()]), null);
});

test("covers the scripts the PR claims, and only those", async () => {
  const typeface = await loadMediaKitTypeface();
  assert.ok(typeface);
  const { coverage } = typeface;

  // Latin (incl. the Spanish set), Greek, Cyrillic, and the punctuation the
  // layout itself draws (the footer separator, the em dash, the euro sign).
  for (const ch of ["A", "z", "í", "ñ", "ü", "ç", "А", "я", "Ж", "Γ", "ώ", "·", "—", "€", "…"]) {
    assert.ok(coverage.has(cp(ch)), `${ch} must be covered`);
  }
  // Deliberately out of scope — full CJK Noto is 10MB+ per weight.
  for (const ch of ["田", "さ", "김", "م", "ש", "क"]) {
    assert.ok(!coverage.has(cp(ch)), `${ch} must NOT be covered`);
  }
});

test("Cyrillic and Greek now survive the sanitiser instead of degrading", async () => {
  const typeface = await loadMediaKitTypeface();
  assert.ok(typeface);
  const { coverage } = typeface;

  // This is the whole point of the change: before the embedded font, WinAnsi
  // turned both of these into `?`.
  assert.equal(toFontSafe("Анна Петрова", coverage), "Анна Петрова");
  assert.equal(toFontSafe("Γιώργος Παπαδόπουλος", coverage), "Γιώργος Παπαδόπουλος");
  assert.match(toWinAnsiSafe("Анна Петрова"), /\?/, "the old path really did degrade it");
});

test("Spanish stays byte-identical on the font path too", async () => {
  const typeface = await loadMediaKitTypeface();
  assert.ok(typeface);
  const { coverage } = typeface;

  for (const name of [
    "Sofia Mendez",
    "Bailarín Nocturno",
    "Compañía de Baile",
    "Müller",
    "Ana Sofía Núñez",
    "Impronta  ·  Ana  ·  Generated August 26, 2026",
  ]) {
    assert.equal(toFontSafe(name, coverage), name, `${name} must pass through unchanged`);
  }
});

test("unsupported scripts degrade to a placeholder, never to blank glyphs", async () => {
  const typeface = await loadMediaKitTypeface();
  assert.ok(typeface);
  const { coverage } = typeface;

  for (const name of ["田中さくら", "김민준", "محمد"]) {
    const out = toFontSafe(name, coverage);
    // Every surviving codepoint must be drawable; that is what stops tofu.
    for (const ch of out) {
      assert.ok(coverage.has(cp(ch)), `${ch} leaked through for ${name}`);
    }
    assert.doesNotMatch(out, /\?{2,}/, "runs of placeholders must collapse");
  }
  assert.match(toFontSafe("DJ 田中 Sofia", coverage), /DJ/);
  assert.match(toFontSafe("DJ 田中 Sofia", coverage), /Sofia/);
});

test("a Cyrillic name renders a real PDF rather than throwing", async () => {
  const bytes = await generateTalentMediaKitPdf(model("Анна Петрова"));
  assert.ok(bytes.byteLength > 1_000, `only ${bytes.byteLength} bytes`);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-");
});

test("an unsupported script still produces a PDF instead of a 500", async () => {
  for (const name of ["田中さくら", "김민준", "Bailarín Nocturno"]) {
    const bytes = await generateTalentMediaKitPdf(model(name));
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-", name);
  }
});
