/**
 * The phone/tablet canvas is an EDITING surface, pinned at the source.
 *
 * The unit tests beside `responsive-canvas-style.ts` prove the routing is
 * correct. They cannot prove the canvas actually USES it: for most of this
 * file's life `canResizeSelectedNode` carried a `device === "desktop"` clause,
 * every direct-manipulation handle hung off it, and the phone canvas was
 * look-but-do-not-touch while every gate stayed green. Re-adding that clause
 * is a one-word edit and would be invisible in review, so it is asserted here.
 *
 * These are SOURCE assertions, and they are honest about it: they prove the
 * wiring is present, not that a drag lands. A live QA pass on the phone canvas
 * is still the thing that proves the feature.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/device-canvas-editing.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(THIS_DIR, "selection-layer.tsx"), "utf8");

test("the resize/spacing gate is no longer desktop-only", () => {
  const gate = SRC.slice(
    SRC.indexOf("const canResizeSelectedNode ="),
    SRC.indexOf("const canRotateSelectedNode ="),
  );
  assert.ok(gate.length > 0, "canResizeSelectedNode moved — repoint this test");
  assert.ok(
    !gate.includes('device === "desktop"'),
    'canResizeSelectedNode has been re-gated to desktop. Resize, the box model ' +
      "and the move grip all hang off it, so that one clause turns the phone " +
      "canvas back into a read-only preview.",
  );
});

test("rotate is the ONE handle left desktop-only, and deliberately", () => {
  // Assert the SHAPE of the gate, not its exact text. This guard used to pin
  // the whole declaration as a literal, which turned the capability refactor
  // (`canResizeSelectedNode` -> `selectedCaps?.rotate`) into a red main even
  // though the rule it protects was never broken. What matters is that rotate
  // keeps its OWN declaration and that the declaration carries the desktop
  // clause -- re-merging it into the resize gate, or dropping the clause, still
  // fails here.
  const start = SRC.indexOf("const canRotateSelectedNode =");
  assert.ok(start !== -1, "canRotateSelectedNode moved — repoint this test");
  const decl = SRC.slice(start, SRC.indexOf(";", start));
  assert.ok(
    decl.includes('device === "desktop"'),
    "rotate's separate gate is what lets the others be device-agnostic",
  );
  assert.ok(
    !decl.includes("canResizeSelectedNode"),
    "rotate must not hang off the resize gate again — that is what made the " +
      "phone canvas read-only, and it is a one-word edit to reintroduce",
  );
  // Whitespace-tolerant: the previous literal included a hard tab and a fixed
  // indent, so any reformat of this JSX read as a regression.
  assert.match(
    SRC,
    /\{\s*canRotateSelectedNode\s*&&\s*!dragChromeSuppressed\s*\?\s*\(\s*<CanvasRotateHandle/,
    "CanvasRotateHandle must render off the rotate gate, not the resize gate",
  );
});

test("every box-model commit routes through the breakpoint-aware hook", () => {
  // One hook, one routing decision. Four hand-rolled `{ ...currentStyle, key }`
  // merges is how one handle ends up still writing the base style on a phone.
  assert.ok(
    SRC.includes("useCanvasBoxModelCommits({"),
    "resize/padding/margin/gap must come from use-canvas-box-model-commits.ts",
  );
  assert.ok(
    SRC.includes("bucket: canvasStyleBucket,"),
    "the hook must be handed the ACTIVE device's bucket",
  );
  assert.match(
    SRC,
    /const canvasStyleBucket = resolveCanvasStyleBucket\(device\);/,
    "the bucket must be derived from the live device, not hardcoded",
  );
});

test("the move grip commits into the active device's bucket", () => {
  assert.match(
    SRC,
    /commitSelectedNodeTranslate\(x, y, canvasStyleBucket\)/,
    "a move-grip drag on the phone canvas must not move the block on desktop",
  );
});

test("the selection chip carries the per-device override badge", () => {
  assert.ok(
    SRC.includes("<ResponsiveOverrideBadge"),
    "without the badge, per-device values are invisible state",
  );
  assert.ok(
    SRC.includes("clearResponsiveOverrides({"),
    "the badge's reset must clear the tier, not write a default",
  );
});

test("the selected block is armed as a touch drag surface", () => {
  assert.ok(
    SRC.includes("armTouchDragSurface("),
    "without touch-action:none the browser claims the pan and cancels the drag",
  );
});
