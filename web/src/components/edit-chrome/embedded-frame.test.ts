import assert from "node:assert/strict";
import { test } from "node:test";

import { isEmbeddedInFrame } from "./embedded-frame";

test("top-level window is not embedded", () => {
  const w = { self: {}, top: null as unknown };
  w.top = w.self;
  assert.equal(isEmbeddedInFrame(w), false);
});

test("a framed window is embedded", () => {
  assert.equal(isEmbeddedInFrame({ self: {}, top: {} }), true);
});

test("a throwing top read counts as embedded", () => {
  const w = {
    self: {},
    get top(): unknown {
      throw new Error("cross-origin");
    },
  };
  assert.equal(isEmbeddedInFrame(w), true);
});

test("no window (server) is not embedded", () => {
  assert.equal(isEmbeddedInFrame(undefined), false);
});
