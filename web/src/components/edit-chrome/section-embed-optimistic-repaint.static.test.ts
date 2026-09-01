/**
 * section-embed-optimistic-repaint.static.test.ts — builder-2027 P1 (1J).
 *
 * THE GAP
 * ───────
 * `ClientBuilderCanvas` paints the freeform tree client-side, so a freeform
 * text edit repaints the instant it commits. `section_embed` is the exception:
 * its curated section is PRE-RENDERED ON THE SERVER and handed to the canvas as
 * an island, and `renderSectionEmbed` returns that island verbatim. The canvas
 * re-renders around it and produces the same server markup, so a curated
 * block's text edit stayed stale on a surface where every freeform sibling
 * beside it repainted instantly. That is exactly "curated blocks feel slower
 * than freeform".
 *
 * The optimistic repaint already existed but was gated on "no client canvas is
 * mounted" — a proxy for "the DOM is server-owned" that stopped being true the
 * moment a canvas mounted around a server island. 1J gates on the TARGET
 * instead: a section_embed's DOM is server-owned whether or not a canvas exists.
 *
 * WHY A SOURCE READ HERE
 * ──────────────────────
 * `InlineEditor` is a client component whose commit path runs inside a
 * double-click gesture over a mounted canvas; this lane has no renderer. The
 * property that regressed is a BOOLEAN CONDITION, and reading it is honest about
 * what is and is not proven. What this does NOT prove: that the repaint looks
 * right on screen. It proves the branch can be reached for a section_embed
 * target, which is the thing that was wrong.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/section-embed-optimistic-repaint.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const INLINE_EDITOR = readFileSync(join(HERE, "inline-editor.tsx"), "utf8");
const CANVAS = readFileSync(join(HERE, "client-builder-canvas.tsx"), "utf8");

test("the canvas really does hand back the SERVER island untouched", () => {
  // The premise of the fix. If this ever stops being true — if section_embed
  // starts rendering client-side from the live tree — the repaint branch below
  // is dead weight and should be DELETED, not kept.
  assert.match(
    CANVAS,
    /sectionEmbedIslands\[node\.id\] \?\? null/,
    "renderSectionEmbed must still return the pre-rendered server island. If " +
      "it now renders client-side, delete the 1J stopgap in inline-editor.tsx " +
      "and inline-editor-repaint.ts rather than maintaining a second paint path.",
  );
});

test("a section_embed target takes the optimistic repaint regardless of canvas", () => {
  assert.match(
    INLINE_EDITOR,
    /const targetIsServerIsland = Boolean\(\s*activeEdit\.builderNode\?\.sectionEmbedConfigKey,?\s*\);/,
    "the repaint decision must be derived from the TARGET being a server island",
  );
  assert.match(
    INLINE_EDITOR,
    /targetIsServerIsland \|\| !isAnyBuilderNodeCanvasMounted\(\)/,
    "a section_embed's DOM is server-owned whether or not a client canvas is " +
      "mounted around it, so the mount check alone must not be able to skip it",
  );
});

test("the rich-text mode still follows the target, not a duplicated predicate", () => {
  // The `rich` flag and the gate must be driven by the SAME fact. Two copies of
  // the same predicate is how one of them silently drifts.
  assert.match(
    INLINE_EDITOR,
    /rich: !targetIsServerIsland,/,
    "the rich flag must reuse the same derived value as the gate",
  );
  const configKeyReads =
    INLINE_EDITOR.match(/activeEdit\.builderNode\?\.sectionEmbedConfigKey/g) ?? [];
  assert.equal(
    configKeyReads.length,
    1,
    "the section-embed predicate must be derived once and reused, not re-read " +
      "at each site where it can drift apart",
  );
});

test("the stopgap is labelled as one", () => {
  // A bridge-era workaround that is not marked as one becomes permanent by
  // default. The next reader must be told what deletes it.
  const branch = INLINE_EDITOR.slice(
    INLINE_EDITOR.indexOf("1J (builder-2027)"),
    INLINE_EDITOR.indexOf("applyOptimisticInlineRepaint(activeEdit.el"),
  );
  assert.match(
    branch,
    /STOPGAP/i,
    "the 1J branch must say it is temporary",
  );
  assert.match(
    branch,
    /delete/i,
    "it must name the condition under which it gets deleted, not merely that " +
      "it is temporary",
  );
});
