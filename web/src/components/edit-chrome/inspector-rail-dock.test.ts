import assert from "node:assert/strict";
import { test } from "node:test";

import {
  horizontalGapBetweenInspectorAndRail,
  inspectorOffsetToDockFlush,
  shouldDockInspectorToRail,
} from "./inspector-rail-dock";

test("shouldDockInspectorToRail when flush and vertically aligned", () => {
  const inspector = { left: 100, top: 80, width: 380, height: 600 };
  const rail = { left: 480, top: 90, width: 108, height: 400 };
  assert.equal(horizontalGapBetweenInspectorAndRail(inspector, rail), 0);
  assert.equal(shouldDockInspectorToRail(inspector, rail), true);
});

test("shouldDockInspectorToRail rejects panels that are too far apart", () => {
  const inspector = { left: 100, top: 80, width: 380, height: 600 };
  const rail = { left: 520, top: 90, width: 108, height: 400 };
  assert.equal(shouldDockInspectorToRail(inspector, rail), false);
});

test("inspectorOffsetToDockFlush closes the horizontal gap", () => {
  const inspector = { left: 100, top: 80, width: 380, height: 600 };
  const rail = { left: 490, top: 90, width: 108, height: 400 };
  const next = inspectorOffsetToDockFlush({
    inspectorRect: inspector,
    railRect: rail,
    currentOffset: { x: 0, y: 0 },
  });
  assert.equal(next.x, 10);
  assert.equal(next.y, 0);
});
