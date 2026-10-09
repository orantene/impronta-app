import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { shouldPullCanvasFocus } from "./selection-focus";

test("focus is pulled to the canvas only when the selection changed and no text entry is active", () => {
  assert.equal(shouldPullCanvasFocus({ selectionChanged: true, activeIsTextEntry: false }), true);
  // typing in an inspector field: the tree changes, the selection does not -> never steal focus
  assert.equal(shouldPullCanvasFocus({ selectionChanged: false, activeIsTextEntry: false }), false);
  assert.equal(shouldPullCanvasFocus({ selectionChanged: false, activeIsTextEntry: true }), false);
  assert.equal(shouldPullCanvasFocus({ selectionChanged: true, activeIsTextEntry: true }), false);
});

test("the selection layer remembers the last selection it pulled focus for (heading inspector focus loss, TUL-78/396 #11)", () => {
  const src = readFileSync(join(process.cwd(), "src/components/edit-chrome/selection-layer.tsx"), "utf8");
  assert.match(src, /const lastPulledIdRef = useRef<string \| null>\(null\);/);
  assert.match(src, /const selectionChanged = lastPulledIdRef\.current !== selectedBuilderNodeId;/);
  assert.match(src, /shouldPullCanvasFocus\(\{ selectionChanged, activeIsTextEntry: activeIsTextEntry\(\) \}\)/);
  assert.match(src, /lastPulledIdRef\.current = null;/);
});
