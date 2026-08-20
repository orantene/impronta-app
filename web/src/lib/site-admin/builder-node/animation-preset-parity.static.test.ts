/**
 * animation-preset-parity.static.test.ts — the 3-of-4-layers guard for the
 * builder's entrance animation vocabulary.
 *
 * An animation preset only works when FOUR things agree:
 *   1. `animation-presets.ts` lists it (the zod enum and the TS type derive
 *      from that list, so those two cannot drift by construction),
 *   2. `render.tsx` bakes a `@keyframes bn-anim-<preset>` into the published
 *      stylesheet,
 *   3. the inspector's Animation gallery has a card for it, and
 *   4. the gallery has a tile-scale PREVIEW keyframe so the card actually
 *      plays on hover instead of sitting there.
 *
 * Wiring three of the four is the failure this repo repeats: a preset in the
 * picker that renders as nothing on the published page, or a keyframe that no
 * operator can reach. This test asserts SET EQUALITY in both directions, so it
 * fails on a card without a keyframe AND on a keyframe without a card.
 *
 * It reads the render module's source text rather than importing the renderer:
 * the keyframes live inside a template literal, and a text read is both cheaper
 * and immune to the React/Next import graph.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-node/animation-preset-parity.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BUILDER_ANIMATION_PRESETS,
  BUILDER_ANIMATION_PRESET_SPECS,
  BUILDER_ANIMATION_PREVIEW_CSS,
} from "./animation-presets";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDER_FILE = join(HERE, "render.tsx");
const PANEL_FILE = resolve(
  HERE,
  "../../../components/edit-chrome/inspectors/animation-panel.tsx",
);

/** Every preset that is supposed to have a keyframe: the list minus `none`. */
const ANIMATED_PRESETS = BUILDER_ANIMATION_PRESETS.filter((p) => p !== "none");

/** `@keyframes bn-anim-<name>{...}` names found in the renderer source. */
function publishedKeyframeNames(): Set<string> {
  const source = readFileSync(RENDER_FILE, "utf8");
  const found = new Set<string>();
  const re = /@keyframes\s+bn-anim-([a-z-]+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) found.add(match[1]!);
  return found;
}

/** `@keyframes bnag-<name>{...}` names in the gallery's preview sheet. */
function previewKeyframeNames(): Set<string> {
  const found = new Set<string>();
  const re = /@keyframes\s+bnag-([a-z-]+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(BUILDER_ANIMATION_PREVIEW_CSS))) found.add(match[1]!);
  return found;
}

test("every preset in the gallery has a published keyframe, and vice versa", () => {
  const published = publishedKeyframeNames();
  const declared = new Set<string>(ANIMATED_PRESETS);

  const missingKeyframe = [...declared].filter((p) => !published.has(p)).sort();
  assert.deepEqual(
    missingKeyframe,
    [],
    `Preset(s) offered by the Animation gallery with NO @keyframes bn-anim-* in ` +
      `render.tsx: ${missingKeyframe.join(", ")}. Picking one of these would ` +
      `apply an animation name the browser has never heard of, so the element ` +
      `would render with no motion at all. Add the keyframe to ` +
      `BUILDER_NODE_RENDERER_CSS.`,
  );

  const orphanKeyframe = [...published].filter((p) => !declared.has(p)).sort();
  assert.deepEqual(
    orphanKeyframe,
    [],
    `@keyframes bn-anim-* in render.tsx with no card in the Animation ` +
      `gallery: ${orphanKeyframe.join(", ")}. The motion ships in every ` +
      `visitor's stylesheet and no operator can reach it. Add it to ` +
      `BUILDER_ANIMATION_PRESET_SPECS or delete the keyframe.`,
  );
});

test("every animated preset has a hover PREVIEW keyframe in the gallery", () => {
  const preview = previewKeyframeNames();
  const missing = ANIMATED_PRESETS.filter((p) => !preview.has(p)).sort();
  assert.deepEqual(
    missing,
    [],
    `Preset card(s) with no bnag-* preview keyframe: ${missing.join(", ")}. ` +
      `The card would look identical to the others and do nothing on hover, ` +
      `which is the whole point of the gallery.`,
  );
  const orphan = [...preview].filter((p) => !ANIMATED_PRESETS.includes(p as never)).sort();
  assert.deepEqual(
    orphan,
    [],
    `Preview keyframe(s) for a preset that no longer exists: ${orphan.join(", ")}.`,
  );
});

test("the spec table covers the preset list exactly once each", () => {
  const specValues = BUILDER_ANIMATION_PRESET_SPECS.map((s) => s.value);
  assert.deepEqual(
    [...specValues].sort(),
    [...BUILDER_ANIMATION_PRESETS].sort(),
    "BUILDER_ANIMATION_PRESET_SPECS and BUILDER_ANIMATION_PRESETS disagree.",
  );
  assert.equal(
    new Set(specValues).size,
    specValues.length,
    "A preset appears twice in BUILDER_ANIMATION_PRESET_SPECS.",
  );
});

test("directional presets declare a default distance, others declare none", () => {
  for (const spec of BUILDER_ANIMATION_PRESET_SPECS) {
    if (spec.axis === "none") {
      assert.equal(
        spec.defaultDistance,
        null,
        `${spec.value} does not travel, so it must not claim a default distance.`,
      );
    } else {
      assert.ok(
        spec.defaultDistance && /^\d+px$/.test(spec.defaultDistance),
        `${spec.value} travels, so it needs a px default distance.`,
      );
    }
  }
});

test("each directional keyframe reads --bn-anim-distance with its declared default", () => {
  const source = readFileSync(RENDER_FILE, "utf8");
  for (const spec of BUILDER_ANIMATION_PRESET_SPECS) {
    if (spec.axis === "none" || !spec.defaultDistance) continue;
    const frame = new RegExp(
      `@keyframes\\s+bn-anim-${spec.value}\\s*\\{[^}]*\\}[^}]*\\}`,
    ).exec(source);
    assert.ok(frame, `No keyframe body found for bn-anim-${spec.value}.`);
    assert.ok(
      frame[0].includes(`var(--bn-anim-distance,${spec.defaultDistance})`),
      `bn-anim-${spec.value} must read var(--bn-anim-distance,${spec.defaultDistance}) ` +
        `so the Distance control does something and the default output is ` +
        `unchanged. Found: ${frame[0]}`,
    );
  }
});

test("the Animation panel only writes BASE-lane animation keys", () => {
  // Comments are stripped first: the panel's own header explains WHY it never
  // touches `responsive.tablet`, and a guard that trips on its own rationale is
  // a guard people delete.
  const source = readFileSync(PANEL_FILE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    !/responsive\s*[.:]/.test(source),
    "Animation keys have no responsive lane in this engine. A panel that " +
      "wrote into `responsive.tablet` would persist happily and render " +
      "nothing, which is exactly the defect this tab was built to stop.",
  );
});
