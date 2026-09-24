import assert from "node:assert/strict";
import { test } from "node:test";

import { pickNextFreeStarts } from "./next-free-times";

test("pickNextFreeStarts returns only real starts and never pads the list", () => {
  assert.deepEqual(pickNextFreeStarts(["2026-09-25T16:00:00.000Z", "", "2026-09-25T17:00:00.000Z"], 3), [
    "2026-09-25T16:00:00.000Z",
    "2026-09-25T17:00:00.000Z",
  ]);
  assert.deepEqual(pickNextFreeStarts([]), []);
});
