/**
 * preset-values.test.ts — the field kit's HONESTY GUARD.
 *
 * D9 item 1 says a preset chip must display its real value. A chip that shows
 * a number the renderer no longer emits is worse than a chip that shows
 * nothing: it is a confident lie, and nobody would ever think to check it.
 *
 * So this suite does two things:
 *   1. PARITY — reads `render.tsx` as TEXT and asserts the mirrored tables in
 *      `preset-values.ts` still match the renderer's private const maps. Text,
 *      not import, because importing the renderer pulls the whole Next/React
 *      graph into a unit-test lane for four object literals.
 *   2. SEMANTICS — the caption formatter and `matchPreset` behave as the D9
 *      contract (and the re-lighting decision) promise.
 *
 * Runner: node:test + node:assert/strict.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  BORDER_STYLE_PRESETS,
  GAP_PRESETS,
  ICON_SIZE_PRESETS,
  MAX_WIDTH_PRESETS,
  RADIUS_PRESETS,
  SHADOW_PRESETS,
  SPACER_PRESETS,
  SPACING_PRESETS,
  SPACING_PRESETS_SHIPPED,
  TEXT_SIZE_PRESETS,
  matchPreset,
  presetById,
  presetCaption,
  remToPx,
} from "./preset-values";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDER_TSX = resolve(
  HERE,
  "../../../../lib/site-admin/builder-node/render.tsx",
);

const RENDER_SRC = readFileSync(RENDER_TSX, "utf8");

/**
 * Pull `const NAME = { … } as const;` out of the renderer source and parse the
 * `key: "value"` pairs. Deliberately dumb — these maps are flat string maps and
 * have been for the life of the file; if one grows nesting, this throws rather
 * than silently matching nothing.
 */
function renderMap(name: string): Record<string, string> {
  const re = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\} as const;`);
  const block = RENDER_SRC.match(re);
  assert.ok(
    block,
    `render.tsx no longer declares "const ${name} = { … } as const;". ` +
      `The field kit mirrors it — find where the scale moved and update ` +
      `preset-values.ts, do not delete this guard.`,
  );
  const out: Record<string, string> = {};
  const pair = /["']?([\w:-]+)["']?\s*:\s*["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = pair.exec(block![1])) !== null) out[m[1]] = m[2];
  assert.ok(
    Object.keys(out).length > 0,
    `Parsed zero entries out of ${name} — the guard would pass vacuously.`,
  );
  return out;
}

/** Assert every id in `expected` is mirrored with the same CSS. */
function assertMirrors(
  label: string,
  expected: Record<string, string>,
  table: ReadonlyArray<{ id: string; css: string }>,
) {
  for (const [id, css] of Object.entries(expected)) {
    const mirrored = table.find((p) => p.id === id);
    assert.ok(
      mirrored,
      `${label}: renderer offers "${id}" but preset-values.ts has no entry for it. ` +
        `A preset with no honest value cannot ship a chip caption (D9 item 1).`,
    );
    assert.equal(
      mirrored!.css,
      css,
      `${label}: "${id}" resolves to ${css} in render.tsx but preset-values.ts ` +
        `claims ${mirrored!.css}. The chip would display a stale number.`,
    );
  }
}

// ── 1. Parity with the renderer ─────────────────────────────────────────────

test("spacing presets mirror render.tsx NODE_SPACING", () => {
  assertMirrors("NODE_SPACING", renderMap("NODE_SPACING"), SPACING_PRESETS);
});

test("radius presets mirror render.tsx NODE_RADIUS", () => {
  assertMirrors("NODE_RADIUS", renderMap("NODE_RADIUS"), RADIUS_PRESETS);
});

test("max-width presets mirror render.tsx NODE_MAX_WIDTH", () => {
  assertMirrors("NODE_MAX_WIDTH", renderMap("NODE_MAX_WIDTH"), MAX_WIDTH_PRESETS);
});

test("gap presets mirror render.tsx GAP_BY_SIZE", () => {
  assertMirrors("GAP_BY_SIZE", renderMap("GAP_BY_SIZE"), GAP_PRESETS);
});

test("spacer presets mirror render.tsx SPACER_BY_SIZE", () => {
  assertMirrors("SPACER_BY_SIZE", renderMap("SPACER_BY_SIZE"), SPACER_PRESETS);
});

test("icon-size presets mirror render.tsx ICON_SIZE", () => {
  assertMirrors("ICON_SIZE", renderMap("ICON_SIZE"), ICON_SIZE_PRESETS);
});

test("text-size clamps mirror the renderer's data-builder-style-size rules", () => {
  for (const preset of TEXT_SIZE_PRESETS) {
    if (preset.kind !== "fluid") continue;
    const needle = `-size="${preset.id}"]{font-size:${preset.css.replace(/\s/g, "")}`;
    assert.ok(
      RENDER_SRC.replace(/\s/g, "").includes(needle.replace(/\s/g, "")),
      `Text size "${preset.id}" claims ${preset.css}, which render.tsx does not emit.`,
    );
  }
});

test("gap M and spacing M are genuinely different numbers", () => {
  // The exact confusion D9 exists to end: two chips both labelled "M".
  const gapM = presetById(GAP_PRESETS, "m");
  const spacingM = presetById(SPACING_PRESETS, "m");
  assert.ok(gapM?.numeric && spacingM?.numeric);
  assert.notEqual(
    gapM!.numeric!.value,
    spacingM!.numeric!.value,
    "If these ever converge, delete this test — but check the renderer first.",
  );
  assert.equal(gapM!.numeric!.value, 20);
  assert.equal(spacingM!.numeric!.value, 24);
});

// ── 2. Captions ─────────────────────────────────────────────────────────────

test("every length preset produces a caption (D9 item 1)", () => {
  for (const table of [SPACING_PRESETS, RADIUS_PRESETS, GAP_PRESETS, ICON_SIZE_PRESETS]) {
    for (const preset of table) {
      if (preset.kind !== "length") continue;
      assert.ok(
        presetCaption(preset),
        `"${preset.label}" is a length preset with no caption — it would ship ` +
          `as a bare letter, which is exactly what D9 forbids.`,
      );
    }
  }
});

test("the M padding chip captions as 24, not as nothing", () => {
  assert.equal(presetCaption(presetById(SPACING_PRESETS, "m")!), "24");
  assert.equal(presetCaption(presetById(SPACING_PRESETS, "s")!), "12");
  assert.equal(presetCaption(presetById(SPACING_PRESETS, "l")!), "48");
});

test("the unset preset has no caption — it has no honest value to show", () => {
  assert.equal(presetCaption(presetById(SPACING_PRESETS, "")!), null);
});

test("fluid presets caption as a range, never as a fake single number", () => {
  const lg = presetById(TEXT_SIZE_PRESETS, "lg")!;
  assert.equal(lg.kind, "fluid");
  assert.equal(lg.numeric, null, "a clamp() has no single number to fill an input with");
  assert.equal(presetCaption(lg), "21.6-36");
});

test("shadow presets do not try to caption their whole CSS string", () => {
  for (const preset of SHADOW_PRESETS) {
    if (preset.kind === "unset") continue;
    assert.equal(
      presetCaption(preset),
      null,
      "a 60-character box-shadow cannot be a 10.5px caption; the glyph shows it",
    );
  }
});

test("short keyword presets do caption (border styles)", () => {
  assert.equal(presetCaption(presetById(BORDER_STYLE_PRESETS, "dashed")!), "dashed");
});

test("pill is a keyword, so it never fills the exact input with 999", () => {
  const pill = presetById(RADIUS_PRESETS, "pill")!;
  assert.equal(pill.numeric, null);
  assert.ok(pill.variantNote, "the 999px sentinel must be explained, not silently dropped");
});

// ── 3. matchPreset — the re-lighting decision ───────────────────────────────

test("matchPreset re-lights a chip when the typed value equals its preset", () => {
  const hit = matchPreset(SPACING_PRESETS, { value: 24, unit: "px" });
  assert.equal(hit?.id, "m");
});

test("matchPreset does not match across units — 24rem is not the M preset", () => {
  assert.equal(matchPreset(SPACING_PRESETS, { value: 24, unit: "rem" }), null);
});

test("matchPreset returns null for a value between presets (true custom)", () => {
  assert.equal(matchPreset(SPACING_PRESETS, { value: 25, unit: "px" }), null);
});

test("matchPreset returns null when there is no value at all", () => {
  assert.equal(matchPreset(SPACING_PRESETS, null), null);
});

// ── 4. Odds and ends ────────────────────────────────────────────────────────

test("remToPx uses the 16px root the renderer assumes", () => {
  assert.equal(remToPx(0.75), 12);
  assert.equal(remToPx(1.5), 24);
  assert.equal(remToPx(4.5), 72);
});

test("the shipped spacing table omits xl, which has never had a chip", () => {
  assert.equal(presetById(SPACING_PRESETS_SHIPPED, "xl"), null);
  assert.ok(presetById(SPACING_PRESETS, "xl"), "but the honest table still knows about it");
});
