import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeZOrderTarget,
  Z_ORDER_MAX,
  Z_ORDER_MIN,
} from "./canvas-z-order";

test("no overlapping siblings → every command is a no-op", () => {
  for (const command of ["forward", "backward", "front", "back"] as const) {
    assert.equal(
      computeZOrderTarget({ current: 0, siblings: [], command }),
      null,
    );
  }
});

test("forward hops just above the NEAREST sibling painting above", () => {
  // Stack: me(0) < a(2) < b(5). Forward goes to 3 (above a, still below b) —
  // one neighbour at a time, not straight to the front.
  const siblings = [
    { z: 2, domAfter: false },
    { z: 5, domAfter: false },
  ];
  assert.equal(
    computeZOrderTarget({ current: 0, siblings, command: "forward" }),
    3,
  );
});

test("backward hops just below the nearest sibling painting below", () => {
  const siblings = [
    { z: -3, domAfter: false },
    { z: 1, domAfter: false },
  ];
  assert.equal(
    computeZOrderTarget({ current: 4, siblings, command: "backward" }),
    0,
  );
});

test("equal z uses DOM order to decide who paints above", () => {
  // A later-DOM sibling at the same z paints ABOVE me → forward targets z+1.
  assert.equal(
    computeZOrderTarget({
      current: 0,
      siblings: [{ z: 0, domAfter: true }],
      command: "forward",
    }),
    1,
  );
  // An earlier-DOM sibling at the same z paints BELOW me → forward is a no-op.
  assert.equal(
    computeZOrderTarget({
      current: 0,
      siblings: [{ z: 0, domAfter: false }],
      command: "forward",
    }),
    null,
  );
  // ...and backward targets one below it.
  assert.equal(
    computeZOrderTarget({
      current: 0,
      siblings: [{ z: 0, domAfter: false }],
      command: "backward",
    }),
    -1,
  );
});

test("front / back clear the whole overlapping stack", () => {
  const siblings = [
    { z: -2, domAfter: false },
    { z: 3, domAfter: false },
    { z: 7, domAfter: true },
  ];
  assert.equal(
    computeZOrderTarget({ current: 0, siblings, command: "front" }),
    8,
  );
  assert.equal(
    computeZOrderTarget({ current: 0, siblings, command: "back" }),
    -3,
  );
});

test("already at the front/back → front/forward (back/backward) are no-ops", () => {
  const siblings = [
    { z: 1, domAfter: false },
    { z: 2, domAfter: false },
  ];
  assert.equal(
    computeZOrderTarget({ current: 5, siblings, command: "forward" }),
    null,
  );
  assert.equal(
    computeZOrderTarget({ current: 5, siblings, command: "front" }),
    null,
  );
  // current 0 sits below both siblings: nothing paints below → no-ops.
  assert.equal(
    computeZOrderTarget({ current: 0, siblings, command: "backward" }),
    null,
  );
  assert.equal(
    computeZOrderTarget({ current: 0, siblings, command: "back" }),
    null,
  );
});

test("targets clamp to the registry bounds (-999..999)", () => {
  assert.equal(
    computeZOrderTarget({
      current: 500,
      siblings: [{ z: Z_ORDER_MAX, domAfter: false }],
      command: "forward",
    }),
    Z_ORDER_MAX,
  );
  assert.equal(
    computeZOrderTarget({
      current: -500,
      siblings: [{ z: Z_ORDER_MIN, domAfter: false }],
      command: "backward",
    }),
    Z_ORDER_MIN,
  );
  // Clamp landing exactly on the current value degrades to a no-op.
  assert.equal(
    computeZOrderTarget({
      current: Z_ORDER_MAX,
      siblings: [{ z: Z_ORDER_MAX, domAfter: true }],
      command: "forward",
    }),
    null,
  );
});
