import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STYLE_CONTROLS,
  STYLEABLE_KINDS,
  controlsForKind,
  setCountForKind,
  setComponentStyleProp,
  readComponentStyleProp,
  UNSET,
} from "./component-style-controls";
import { normalizeComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";

test("controlsForKind returns only controls that list the kind", () => {
  const headingControls = controlsForKind("heading");
  assert.ok(headingControls.length > 0);
  for (const c of headingControls) assert.ok(c.appliesTo.includes("heading"));
  // A control that does not apply (e.g. `radius` is a box prop) is excluded.
  assert.ok(!headingControls.some((c) => c.prop === "radius"));
  // Section gets box controls but not text-only ones (e.g. `tone`).
  const sectionControls = controlsForKind("section");
  assert.ok(sectionControls.some((c) => c.prop === "radius"));
  assert.ok(!sectionControls.some((c) => c.prop === "tone"));
});

test("every styleable kind has at least one curated control", () => {
  for (const { kind } of STYLEABLE_KINDS) {
    assert.ok(controlsForKind(kind).length > 0, `${kind} has no controls`);
  }
});

test("setComponentStyleProp sets a value immutably (no mutation of input)", () => {
  const base: ComponentStyleDefaults = {};
  const next = setComponentStyleProp(base, "heading", "align", "center");
  assert.deepEqual(base, {}, "input not mutated");
  assert.equal((next.heading as Record<string, unknown>).align, "center");
});

test("setComponentStyleProp on a fresh kind creates the entry; second prop merges", () => {
  let s: ComponentStyleDefaults = {};
  s = setComponentStyleProp(s, "heading", "align", "center");
  s = setComponentStyleProp(s, "heading", "tone", "muted");
  assert.deepEqual(s.heading, { align: "center", tone: "muted" });
});

test("clearing a prop (UNSET) removes the key; clearing the last prop drops the kind", () => {
  let s: ComponentStyleDefaults = {};
  s = setComponentStyleProp(s, "heading", "align", "center");
  s = setComponentStyleProp(s, "heading", "tone", "muted");
  s = setComponentStyleProp(s, "heading", "tone", UNSET);
  assert.deepEqual(s.heading, { align: "center" }, "only tone removed");
  s = setComponentStyleProp(s, "heading", "align", UNSET);
  assert.equal(s.heading, undefined, "kind dropped when empty");
  assert.deepEqual(s, {});
});

test("readComponentStyleProp returns the value or UNSET", () => {
  const s = setComponentStyleProp({}, "card", "radius", "lg");
  assert.equal(readComponentStyleProp(s, "card", "radius"), "lg");
  assert.equal(readComponentStyleProp(s, "card", "background"), UNSET);
  assert.equal(readComponentStyleProp(s, "heading", "align"), UNSET);
});

test("setCountForKind counts only set curated props", () => {
  let s: ComponentStyleDefaults = {};
  assert.equal(setCountForKind(s, "heading"), 0);
  s = setComponentStyleProp(s, "heading", "align", "center");
  s = setComponentStyleProp(s, "heading", "tone", "strong");
  assert.equal(setCountForKind(s, "heading"), 2);
  // A non-curated key present on the entry is not counted.
  s = { ...s, heading: { ...(s.heading as object), letterSpacing: "1px" } };
  assert.equal(setCountForKind(s, "heading"), 2);
});

test("every curated value round-trips through normalizeComponentStyleDefaults", () => {
  // Build a map that sets every control on every applicable kind to its first
  // option, then confirm the schema normalizer keeps every value (no value the
  // editor can emit is rejected by the save pipeline).
  let s: ComponentStyleDefaults = {};
  for (const { kind } of STYLEABLE_KINDS) {
    for (const c of controlsForKind(kind)) {
      s = setComponentStyleProp(s, kind, c.prop, c.options[0]);
    }
  }
  const normalized = normalizeComponentStyleDefaults(s);
  for (const { kind } of STYLEABLE_KINDS) {
    const before = s[kind] as Record<string, unknown> | undefined;
    const after = normalized[kind] as Record<string, unknown> | undefined;
    if (!before) continue;
    for (const key of Object.keys(before)) {
      assert.equal(after?.[key], before[key], `${kind}.${key} dropped by normalize`);
    }
  }
});

test("control option sets are non-empty and unique props per kind", () => {
  for (const c of STYLE_CONTROLS) {
    assert.ok(c.options.length > 0, `${String(c.prop)} has no options`);
  }
  for (const { kind } of STYLEABLE_KINDS) {
    const props = controlsForKind(kind).map((c) => c.prop);
    assert.equal(new Set(props).size, props.length, `${kind} has duplicate prop controls`);
  }
});
