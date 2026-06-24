import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPresentationFieldPatch } from "./responsive-field-state";

/**
 * Guards the reconstruct-safe per-breakpoint write used by responsive editing.
 * The section Style panel's `onPresentationPatch` is a SHALLOW merge, so a write
 * must reconstruct the full `breakpoints` map — otherwise editing mobile padding
 * would stomp the tablet bucket (or sibling fields). node:test so it runs in the
 * test:builder-chrome CI lane (the colocated vitest file is not in vitest's glob).
 */

const presentation = {
  paddingTop: "l",
  breakpoints: {
    tablet: { paddingTop: "m", paddingBottom: "s" },
    mobile: { visibility: "hidden" },
  },
};

test("base device writes the top-level field (no breakpoints)", () => {
  assert.deepEqual(
    buildPresentationFieldPatch(presentation, "desktop", "paddingTop", "xl"),
    { paddingTop: "xl" },
  );
});

test("non-base set preserves sibling buckets AND sibling fields", () => {
  assert.deepEqual(
    buildPresentationFieldPatch(presentation, "tablet", "paddingTop", "xs"),
    {
      breakpoints: {
        tablet: { paddingTop: "xs", paddingBottom: "s" },
        mobile: { visibility: "hidden" },
      },
    },
  );
});

test("empty value clears the bucket field without stomping siblings", () => {
  assert.deepEqual(
    buildPresentationFieldPatch(presentation, "tablet", "paddingTop", ""),
    {
      breakpoints: {
        tablet: { paddingBottom: "s" },
        mobile: { visibility: "hidden" },
      },
    },
  );
});

test("prunes an emptied bucket, then the whole map", () => {
  assert.deepEqual(
    buildPresentationFieldPatch(presentation, "mobile", "visibility", undefined),
    { breakpoints: { tablet: { paddingTop: "m", paddingBottom: "s" } } },
  );
  const single = { breakpoints: { mobile: { visibility: "hidden" } } };
  assert.deepEqual(
    buildPresentationFieldPatch(single, "mobile", "visibility", undefined),
    { breakpoints: undefined },
  );
});
