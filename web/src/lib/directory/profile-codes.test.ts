import assert from "node:assert/strict";
import { test } from "node:test";

import {
  directoryProfileCodesCacheKey,
  normalizeDirectoryProfileCodes,
} from "./profile-codes";

test("normalizeDirectoryProfileCodes trims, de-dupes, preserves first-seen order", () => {
  assert.deepEqual(normalizeDirectoryProfileCodes(undefined), []);
  assert.deepEqual(normalizeDirectoryProfileCodes([]), []);
  assert.deepEqual(
    normalizeDirectoryProfileCodes([" TAL-2 ", "TAL-1", "TAL-2", ""]),
    ["TAL-2", "TAL-1"],
  );
});

test("directoryProfileCodesCacheKey is order-insensitive", () => {
  assert.equal(
    directoryProfileCodesCacheKey(["TAL-2", "TAL-1"]),
    directoryProfileCodesCacheKey(["TAL-1", "TAL-2"]),
  );
  assert.equal(directoryProfileCodesCacheKey([]), "");
});
