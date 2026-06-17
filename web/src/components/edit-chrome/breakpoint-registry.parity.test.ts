/**
 * RESP-1 parity: the editable inspector tiers (the InspectorViewportRail device
 * buttons) and the override-detection loops are ALL derived from ONE source —
 * the breakpoint registry. This test asserts they agree, so the registry and
 * the editable inspector tiers can never silently drift apart again.
 *
 * Runs under the node built-in test runner: `npx tsx --test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_BUILDER_BREAKPOINTS,
  baseBreakpointId,
  editableOverrideTierIds,
  inspectorRailTierIds,
  isBaseBreakpoint,
  type BuilderBreakpoint,
} from "./breakpoint-registry";
import {
  getPresentationOverrideDevice,
  getStyleOverrideDevice,
  patchFieldForDevice,
  patchStyleFieldForDevice,
} from "./inspectors/responsive-field-state";

test("registry declares exactly one base tier (desktop)", () => {
  const bases = DEFAULT_BUILDER_BREAKPOINTS.filter((bp) => bp.isBase);
  assert.equal(bases.length, 1);
  assert.equal(baseBreakpointId(), "desktop");
});

test("the inspector rail tiers = base + editable registry tiers", () => {
  // The rail offers the base tier plus one button per editable non-base tier.
  const expected = [baseBreakpointId(), ...editableOverrideTierIds()];
  assert.deepEqual(inspectorRailTierIds(), expected);
  // Legacy rail order preserved (desktop → tablet → mobile), so the device row
  // is visually byte-stable with the pre-RESP-1 hardcoded 3-device list.
  assert.deepEqual(inspectorRailTierIds(), ["desktop", "tablet", "mobile"]);
});

test("every editable rail tier is a non-base registry tier (no orphan buttons)", () => {
  for (const id of inspectorRailTierIds()) {
    const tier = DEFAULT_BUILDER_BREAKPOINTS.find((bp) => bp.id === id);
    assert.ok(tier, `rail tier "${id}" exists in the registry`);
    if (!isBaseBreakpoint(id)) {
      assert.equal(tier?.editable, true, `non-base rail tier "${id}" is editable`);
    }
  }
});

test("editable override tiers are exactly the registry's editable non-base tiers", () => {
  const fromRegistry = DEFAULT_BUILDER_BREAKPOINTS.filter(
    (bp) => !bp.isBase && bp.editable,
  ).map((bp) => bp.id);
  // Same SET as the registry's editable non-base tiers...
  assert.deepEqual([...editableOverrideTierIds()].sort(), [...fromRegistry].sort());
  // ...ordered largest-to-smallest, preserving the legacy ['tablet','mobile']
  // override-detection precedence (first match wins on multi-tier overrides).
  assert.deepEqual(editableOverrideTierIds(), ["tablet", "mobile"]);
});

test("override-detection iterates exactly the editable registry tiers", () => {
  // Seed a bucket in EVERY editable tier; the detector must find each one and
  // must NOT report the base tier or a non-editable tier as an override owner.
  for (const tier of editableOverrideTierIds()) {
    const presentation = { breakpoints: { [tier]: { paddingTop: "m" } } };
    assert.equal(getPresentationOverrideDevice(presentation, "paddingTop"), tier);

    const style = { responsive: { [tier]: { fontSize: "12px" } } };
    assert.equal(getStyleOverrideDevice(style, "fontSize"), tier);
  }
  // A bucket in a NON-editable tier (wide) is not reported by the loop.
  assert.equal(
    getPresentationOverrideDevice({ breakpoints: { wide: { paddingTop: "m" } } }, "paddingTop"),
    null,
  );
});

test("patch routing: base edits the default, non-base writes the matching bucket", () => {
  assert.deepEqual(patchFieldForDevice(baseBreakpointId(), "paddingTop", "l"), {
    paddingTop: "l",
  });
  for (const tier of editableOverrideTierIds()) {
    assert.deepEqual(patchFieldForDevice(tier, "paddingTop", "m"), {
      breakpoints: { [tier]: { paddingTop: "m" } },
    });
    assert.deepEqual(patchStyleFieldForDevice(tier, "fontSize", "12px"), {
      style: { responsive: { [tier]: { fontSize: "12px" } } },
    });
  }
});

test("widening the registry to a new editable tier flows through every consumer", () => {
  // Simulate flipping `wide` editable (the deferred render follow-on). The rail
  // tiers, the override loop, and patch routing all pick it up with no code change.
  const widened: BuilderBreakpoint[] = DEFAULT_BUILDER_BREAKPOINTS.map((bp) =>
    bp.id === "wide" ? { ...bp, editable: true } : { ...bp },
  );
  assert.ok(editableOverrideTierIds(widened).includes("wide"));
  assert.ok(inspectorRailTierIds(widened).includes("wide"));
});
