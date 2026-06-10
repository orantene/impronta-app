import assert from "node:assert/strict";
import { test } from "node:test";

import {
  anchorToCursor,
  cursorToAnchor,
  projectAcrossRects,
  type AnchorRect,
} from "./cursor-coords";

// WS1-B — the load-bearing guarantee: a cursor over a builder node renders at the
// SAME on-screen point for a peer whose node box differs (different zoom / scroll /
// window width), because we anchor to a fraction of the node's (post-transform) box.

test("cursorToAnchor → anchorToCursor round-trips on the same rect", () => {
  const rect: AnchorRect = { left: 100, top: 200, width: 400, height: 50 };
  const a = cursorToAnchor(300, 225, "heading-1", rect);
  assert.equal(a.nodeId, "heading-1");
  assert.equal(a.fx, 0.5); // halfway across
  assert.equal(a.fy, 0.5); // halfway down
  const back = anchorToCursor(a, rect);
  assert.equal(back.x, 300);
  assert.equal(back.y, 225);
});

test("re-projects correctly when the receiver is ZOOMED (node box scaled)", () => {
  // Sender at 100% zoom: node 400px wide at left=100. Cursor at 1/4 across (x=200).
  const sender: AnchorRect = { left: 100, top: 200, width: 400, height: 50 };
  // Receiver at 50% zoom: same node is 200px wide, and centered differently (left=300).
  const receiver: AnchorRect = { left: 300, top: 90, width: 200, height: 25 };
  const out = projectAcrossRects(200, 200, "heading-1", sender, receiver);
  // fx = (200-100)/400 = 0.25 → receiver x = 300 + 0.25*200 = 350
  assert.equal(out.x, 350);
  // fy = (200-200)/50 = 0 → receiver y = 90
  assert.equal(out.y, 90);
});

test("re-projects correctly when the receiver is SCROLLED (node box shifted up)", () => {
  const sender: AnchorRect = { left: 0, top: 500, width: 100, height: 100 };
  // Receiver scrolled down 400px → the same node sits at top = 100.
  const receiver: AnchorRect = { left: 0, top: 100, width: 100, height: 100 };
  const out = projectAcrossRects(50, 550, "n", sender, receiver);
  // fx=0.5, fy=(550-500)/100=0.5 → receiver (0+0.5*100, 100+0.5*100) = (50,150)
  assert.equal(out.x, 50);
  assert.equal(out.y, 150);
});

test("re-projects correctly when the receiver has a DIFFERENT window width (node centered elsewhere)", () => {
  // transform-origin: top center → wider window pushes the node's left edge right.
  const sender: AnchorRect = { left: 200, top: 0, width: 600, height: 80 };
  const receiver: AnchorRect = { left: 400, top: 0, width: 600, height: 80 };
  const out = projectAcrossRects(500, 40, "n", sender, receiver);
  // fx=(500-200)/600=0.5 → receiver x = 400 + 0.5*600 = 700 (the node's visual center on their screen)
  assert.equal(out.x, 700);
  assert.equal(out.y, 40);
});

test("degenerate (zero-size) node box does not divide by zero", () => {
  const rect: AnchorRect = { left: 10, top: 10, width: 0, height: 0 };
  const a = cursorToAnchor(10, 10, "n", rect);
  assert.equal(a.fx, 0);
  assert.equal(a.fy, 0);
  const back = anchorToCursor(a, rect);
  assert.equal(back.x, 10);
  assert.equal(back.y, 10);
});
