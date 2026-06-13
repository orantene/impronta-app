import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TALENT_DESIGN_KEY,
  emptyTalentDesignSlice,
  mergeStyleClassesPreservingDesign,
  readTalentDesignSlice,
  readTalentStyleClasses,
  writeTalentDesignSlice,
} from "./talent-design-store";

/**
 * Pure-core proof for the talent-scoped theme storage shape on
 * `talent_pages.theme`. No Supabase / Next graph — drives the split/merge
 * helpers directly. The single hard guarantee: the design slice (`__design`)
 * and the page-scoped style-class entries NEVER clobber each other regardless
 * of which writer runs.
 */

const SLICE = {
  tokens: { "color.primary": "#0a0" },
  tokensDraft: { "color.primary": "#f00" },
  componentStyles: { heading: { textColor: "#0a0" } },
  componentStylesDraft: {},
  presetSlug: "editorial-noir",
  publishedAt: "2026-06-12T00:00:00.000Z",
  version: 4,
};

test("emptyTalentDesignSlice: zeroed slice", () => {
  assert.deepEqual(emptyTalentDesignSlice(), {
    tokens: {},
    tokensDraft: {},
    componentStyles: {},
    componentStylesDraft: {},
    presetSlug: null,
    publishedAt: null,
    version: 0,
  });
});

test("readTalentDesignSlice: malformed → empty slice", () => {
  assert.deepEqual(readTalentDesignSlice(null), emptyTalentDesignSlice());
  assert.deepEqual(readTalentDesignSlice([1, 2]), emptyTalentDesignSlice());
  assert.deepEqual(readTalentDesignSlice("oops"), emptyTalentDesignSlice());
  assert.deepEqual(readTalentDesignSlice({ abc: {} }), emptyTalentDesignSlice());
});

test("readTalentDesignSlice: extracts + coerces the slice", () => {
  const theme = { abc: { display: "flex" }, [TALENT_DESIGN_KEY]: SLICE };
  assert.deepEqual(readTalentDesignSlice(theme), SLICE);
});

test("readTalentStyleClasses: returns every key EXCEPT __design", () => {
  const theme = {
    abc: { display: "flex" },
    def: { color: "red" },
    [TALENT_DESIGN_KEY]: SLICE,
  };
  assert.deepEqual(readTalentStyleClasses(theme), {
    abc: { display: "flex" },
    def: { color: "red" },
  });
});

test("writeTalentDesignSlice: preserves style classes, replaces slice", () => {
  const theme = {
    abc: { display: "flex" },
    [TALENT_DESIGN_KEY]: { ...SLICE, version: 1 },
  };
  const next = writeTalentDesignSlice(theme, SLICE);
  assert.deepEqual(next, { abc: { display: "flex" }, [TALENT_DESIGN_KEY]: SLICE });
});

test("mergeStyleClassesPreservingDesign: content save keeps the design slice", () => {
  // The CONTENT adapter overwrites the style classes but MUST keep __design.
  const existing = { oldClass: { a: 1 }, [TALENT_DESIGN_KEY]: SLICE };
  const newStyleClasses = { newClass: { b: 2 } };
  const merged = mergeStyleClassesPreservingDesign(existing, newStyleClasses);
  assert.deepEqual(merged, {
    newClass: { b: 2 },
    [TALENT_DESIGN_KEY]: SLICE,
  });
  // The old style classes are gone (full replace) but the slice survived.
  assert.equal("oldClass" in merged, false);
});

test("mergeStyleClassesPreservingDesign: no existing slice → no __design added", () => {
  const merged = mergeStyleClassesPreservingDesign(
    { oldClass: {} },
    { newClass: {} },
  );
  assert.deepEqual(merged, { newClass: {} });
  assert.equal(TALENT_DESIGN_KEY in merged, false);
});

test("mergeStyleClassesPreservingDesign: incoming __design is stripped, existing wins", () => {
  // A malicious / stale style-class map can't smuggle in or overwrite the slice.
  const existing = { [TALENT_DESIGN_KEY]: SLICE };
  const incoming = {
    legitClass: {},
    [TALENT_DESIGN_KEY]: { tokens: { evil: "x" }, version: 999 },
  };
  const merged = mergeStyleClassesPreservingDesign(existing, incoming);
  assert.deepEqual(merged[TALENT_DESIGN_KEY], SLICE);
  assert.deepEqual(merged.legitClass, {});
});

test("round-trip: write slice then merge content preserves it", () => {
  // Simulate: theme drawer publishes a slice, then a content save runs.
  const themed = writeTalentDesignSlice({ classA: {} }, SLICE);
  const afterContentSave = mergeStyleClassesPreservingDesign(themed, { classB: {} });
  assert.deepEqual(readTalentDesignSlice(afterContentSave), SLICE);
  assert.deepEqual(readTalentStyleClasses(afterContentSave), { classB: {} });
});
