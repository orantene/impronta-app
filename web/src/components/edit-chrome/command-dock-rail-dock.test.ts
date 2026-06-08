import assert from "node:assert/strict";
import { test } from "node:test";

import {
  horizontalGapBetweenPanelAndCommandDock,
  panelOffsetToDockFlushLeft,
  shouldDockPanelToCommandDock,
} from "./command-dock-rail-dock";

test("shouldDockPanelToCommandDock when flush and vertically aligned", () => {
  const dock = { left: 16, top: 80, width: 88, height: 400 };
  const panel = { left: 104, top: 90, width: 320, height: 600 };
  assert.equal(horizontalGapBetweenPanelAndCommandDock(panel, dock), 0);
  assert.equal(shouldDockPanelToCommandDock(panel, dock), true);
});

test("shouldDockPanelToCommandDock when within threshold gap", () => {
  const dock = { left: 16, top: 80, width: 88, height: 400 };
  const panel = { left: 120, top: 80, width: 320, height: 600 };
  assert.equal(horizontalGapBetweenPanelAndCommandDock(panel, dock), 16);
  assert.equal(shouldDockPanelToCommandDock(panel, dock), true);
});

test("shouldDockPanelToCommandDock rejects panels that are too far apart", () => {
  const dock = { left: 16, top: 80, width: 88, height: 400 };
  const panel = { left: 140, top: 90, width: 320, height: 600 };
  assert.equal(shouldDockPanelToCommandDock(panel, dock), false);
});

test("panelOffsetToDockFlushLeft closes the horizontal gap", () => {
  const dock = { left: 16, top: 80, width: 88, height: 400 };
  const panel = { left: 114, top: 90, width: 320, height: 600 };
  const next = panelOffsetToDockFlushLeft({
    panelRect: panel,
    dockRect: dock,
    currentOffset: { x: 0, y: 0 },
  });
  assert.equal(next.x, -10);
  assert.equal(next.y, 0);
});
