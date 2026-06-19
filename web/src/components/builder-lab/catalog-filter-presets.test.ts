import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type FilterPreset,
  type FilterState,
  BUILT_IN_PRESETS,
  deserializePresets,
  labelToKey,
  makePreset,
  mergePresets,
  presetToState,
  serializePresets,
  snapshotToPreset,
  stateMatchesPreset,
} from "./catalog-filter-presets";

// ── makePreset ────────────────────────────────────────────────────────────────

test("makePreset: applies defaults for omitted fields", () => {
  const p = makePreset("x", "X", {});
  assert.equal(p.key, "x");
  assert.equal(p.label, "X");
  assert.equal(p.tab, null);
  assert.equal(p.mode, "all");
  assert.equal(p.surface, "agency");
});

test("makePreset: explicit fields override defaults", () => {
  const p = makePreset("r", "R", {
    tab: "connected",
    mode: "hidden",
    surface: "talent",
  });
  assert.equal(p.tab, "connected");
  assert.equal(p.mode, "hidden");
  assert.equal(p.surface, "talent");
});

// ── BUILT_IN_PRESETS ──────────────────────────────────────────────────────────

test("BUILT_IN_PRESETS: contains awaiting-review preset", () => {
  const p = BUILT_IN_PRESETS.find((b) => b.key === "awaiting-review");
  assert.ok(p, "awaiting-review preset should exist");
  assert.equal(p!.mode, "customized");
});

test("BUILT_IN_PRESETS: all entries have unique keys", () => {
  const keys = BUILT_IN_PRESETS.map((p) => p.key);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length);
});

test("BUILT_IN_PRESETS: all entries have non-empty labels", () => {
  for (const p of BUILT_IN_PRESETS) {
    assert.ok(p.label.trim().length > 0, `Preset ${p.key} should have a non-empty label`);
  }
});

// ── serializePresets / deserializePresets ─────────────────────────────────────

test("round-trip: serialize then deserialize returns identical presets", () => {
  const presets: FilterPreset[] = [
    makePreset("a", "Alpha", { tab: "layout", mode: "all" }),
    makePreset("b", "Beta", { tab: "connected", mode: "hidden", surface: "talent" }),
  ];
  const restored = deserializePresets(serializePresets(presets));
  assert.deepEqual(restored, presets);
});

test("deserializePresets: returns empty array for invalid JSON", () => {
  assert.deepEqual(deserializePresets("not-json{{{{"), []);
});

test("deserializePresets: returns empty array for JSON non-array", () => {
  assert.deepEqual(deserializePresets(JSON.stringify({ key: "x" })), []);
});

test("deserializePresets: filters out entries missing required fields", () => {
  const raw = JSON.stringify([
    // valid
    { key: "a", label: "A", tab: null, mode: "all", surface: "agency" },
    // missing mode
    { key: "b", label: "B", tab: null, surface: "agency" },
    // bad mode value
    { key: "c", label: "C", tab: null, mode: "INVALID", surface: "agency" },
    // bad surface value
    { key: "d", label: "D", tab: null, mode: "all", surface: "both" },
  ]);
  const result = deserializePresets(raw);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, "a");
});

test("deserializePresets: tab === null is valid", () => {
  const raw = JSON.stringify([
    { key: "x", label: "X", tab: null, mode: "all", surface: "agency" },
  ]);
  const [p] = deserializePresets(raw);
  assert.equal(p.tab, null);
});

// ── snapshotToPreset / presetToState ──────────────────────────────────────────

test("snapshotToPreset: captures current filter state", () => {
  const state: FilterState = { tab: "layout", mode: "hidden", surface: "talent" };
  const p = snapshotToPreset("my-snap", "My Snap", state);
  assert.equal(p.key, "my-snap");
  assert.equal(p.tab, "layout");
  assert.equal(p.mode, "hidden");
  assert.equal(p.surface, "talent");
});

test("presetToState: extracts state from preset", () => {
  const p = makePreset("q", "Q", { tab: "media", mode: "customized", surface: "talent" });
  const state = presetToState(p);
  assert.deepEqual(state, { tab: "media", mode: "customized", surface: "talent" });
});

test("snapshot + restore round-trip is identity", () => {
  const original: FilterState = { tab: "connected", mode: "customized", surface: "talent" };
  const p = snapshotToPreset("rt", "RT", original);
  const restored = presetToState(p);
  assert.deepEqual(restored, original);
});

// ── stateMatchesPreset ────────────────────────────────────────────────────────

test("stateMatchesPreset: exact match returns true", () => {
  const p = makePreset("p", "P", { tab: "layout", mode: "all", surface: "agency" });
  const s: FilterState = { tab: "layout", mode: "all", surface: "agency" };
  assert.equal(stateMatchesPreset(s, p), true);
});

test("stateMatchesPreset: different tab returns false", () => {
  const p = makePreset("p", "P", { tab: "layout", mode: "all" });
  const s: FilterState = { tab: "media", mode: "all", surface: "agency" };
  assert.equal(stateMatchesPreset(s, p), false);
});

test("stateMatchesPreset: different mode returns false", () => {
  const p = makePreset("p", "P", { tab: "layout", mode: "all" });
  const s: FilterState = { tab: "layout", mode: "hidden", surface: "agency" };
  assert.equal(stateMatchesPreset(s, p), false);
});

test("stateMatchesPreset: null tab matches null tab preset", () => {
  const p = makePreset("p", "P", { tab: null, mode: "hidden" });
  const s: FilterState = { tab: null, mode: "hidden", surface: "agency" };
  assert.equal(stateMatchesPreset(s, p), true);
});

test("stateMatchesPreset: surface mismatch only matters for connected tab", () => {
  // Non-connected tab: surface difference is ignored
  const p = makePreset("p", "P", { tab: "layout", mode: "all", surface: "agency" });
  const s: FilterState = { tab: "layout", mode: "all", surface: "talent" };
  assert.equal(stateMatchesPreset(s, p), true);
});

test("stateMatchesPreset: surface mismatch matters for connected tab", () => {
  const p = makePreset("p", "P", { tab: "connected", mode: "all", surface: "agency" });
  const s: FilterState = { tab: "connected", mode: "all", surface: "talent" };
  assert.equal(stateMatchesPreset(s, p), false);
});

test("stateMatchesPreset: surface match on connected tab returns true", () => {
  const p = makePreset("p", "P", { tab: "connected", mode: "all", surface: "talent" });
  const s: FilterState = { tab: "connected", mode: "all", surface: "talent" };
  assert.equal(stateMatchesPreset(s, p), true);
});

// ── mergePresets ──────────────────────────────────────────────────────────────

test("mergePresets: built-ins appear first", () => {
  const custom = [makePreset("my-preset", "My Preset", {})];
  const merged = mergePresets(custom);
  assert.equal(merged[0].key, BUILT_IN_PRESETS[0].key);
});

test("mergePresets: custom presets appended after built-ins", () => {
  const custom = [makePreset("z", "Z", { mode: "customized" })];
  const merged = mergePresets(custom);
  const last = merged[merged.length - 1];
  assert.equal(last.key, "z");
});

test("mergePresets: custom key colliding with built-in is dropped", () => {
  const collision = makePreset("all-components", "Duplicate", {});
  const merged = mergePresets([collision]);
  // Should still have only one "all-components"
  const matches = merged.filter((p) => p.key === "all-components");
  assert.equal(matches.length, 1);
  // The surviving one is the built-in
  assert.equal(matches[0].label, BUILT_IN_PRESETS.find((b) => b.key === "all-components")!.label);
});

test("mergePresets: empty custom returns just built-ins", () => {
  const merged = mergePresets([]);
  assert.equal(merged.length, BUILT_IN_PRESETS.length);
});

// ── labelToKey ────────────────────────────────────────────────────────────────

test("labelToKey: slugifies a normal label", () => {
  assert.equal(labelToKey("My Filter", []), "my-filter");
});

test("labelToKey: strips leading/trailing hyphens", () => {
  assert.equal(labelToKey("  ---hello---  ", []), "hello");
});

test("labelToKey: avoids collision by appending counter", () => {
  assert.equal(labelToKey("My Filter", ["my-filter"]), "my-filter-2");
});

test("labelToKey: increments counter past existing collisions", () => {
  assert.equal(
    labelToKey("My Filter", ["my-filter", "my-filter-2", "my-filter-3"]),
    "my-filter-4",
  );
});

test("labelToKey: blank label falls back to 'preset'", () => {
  assert.equal(labelToKey("", []), "preset");
});

test("labelToKey: non-latin chars replaced with hyphens", () => {
  const key = labelToKey("¡Héllo! World", []);
  // Should not contain special chars
  assert.ok(/^[a-z0-9-]+$/.test(key), `Key "${key}" should only contain a-z, 0-9, -`);
});
