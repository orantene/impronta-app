/**
 * catalog-bulk-selection.test.ts — unit tests for the O2 bulk-selection PURE
 * logic: selection-set mutation (toggle / select-all-visible / clear) and the
 * derivation of the O1 batch-action inputs from a selection.
 *
 * Test runner: node:test + node:assert/strict (tsx --test). No React, no DOM.
 * Run:  node_modules/.bin/tsx --test src/components/builder-lab/catalog-bulk-selection.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import {
  toggleSelected,
  selectAllVisible,
  clearVisible,
  clearSelection,
  allVisibleSelected,
  selectedRows,
  deriveSurfaceBatchInputs,
  deriveAvailabilityBatchInputs,
  deriveResetRefs,
  summarizeBatchResults,
  failedRefs,
  summarizeUsageForRows,
} from "./catalog-bulk-selection";

// ── fixtures ─────────────────────────────────────────────────────────────────

/** Minimal CatalogAdminItem stub — only the fields the derivation reads. */
function row(
  id: string,
  opts: Partial<
    Pick<CatalogAdminItem, "source" | "targetContext" | "overlay" | "usageCount">
  > = {},
): CatalogAdminItem {
  return {
    id,
    source: opts.source ?? "code",
    targetContext: opts.targetContext ?? "both",
    overlay: opts.overlay ?? null,
    usageCount: opts.usageCount,
    // Unused-by-derivation fields, stubbed to satisfy the type.
    tab: "blocks",
    status: "published",
    itemKind: "static",
    availability: "available",
    connectedSource: undefined,
    baseLabel: id,
    baseCategory: "misc",
    baseIcon: "square",
    talentVisible: true,
    workspaceVisible: true,
    surfaceVisible: {
      talent_profile: true,
      talent_shell: true,
      workspace_page: true,
      workspace_shell: true,
    },
    labVisible: true,
    effectiveLabel: id,
    effectiveCategory: "misc",
  } as CatalogAdminItem;
}

// ── selection-set primitives ─────────────────────────────────────────────────

test("toggleSelected adds an unselected id and removes a selected one", () => {
  const a = toggleSelected(new Set(), "x");
  assert.deepEqual([...a], ["x"]);
  const b = toggleSelected(a, "x");
  assert.deepEqual([...b], []);
});

test("toggleSelected returns a new set (no mutation of the input)", () => {
  const start = new Set(["a"]);
  const next = toggleSelected(start, "b");
  assert.deepEqual([...start], ["a"], "input untouched");
  assert.deepEqual([...next].sort(), ["a", "b"]);
});

test("selectAllVisible unions visible ids onto the existing selection", () => {
  const next = selectAllVisible(new Set(["keep"]), ["a", "b"]);
  assert.deepEqual([...next].sort(), ["a", "b", "keep"]);
});

test("clearVisible removes only the visible ids, preserving off-view selections", () => {
  const next = clearVisible(new Set(["a", "b", "offview"]), ["a", "b"]);
  assert.deepEqual([...next], ["offview"]);
});

test("clearSelection empties the whole set", () => {
  assert.deepEqual([...clearSelection()], []);
});

test("allVisibleSelected is true only when every visible id is selected", () => {
  assert.equal(allVisibleSelected(new Set(["a", "b"]), ["a", "b"]), true);
  assert.equal(allVisibleSelected(new Set(["a"]), ["a", "b"]), false);
  assert.equal(allVisibleSelected(new Set(), []), false, "no rows ⇒ false");
});

test("selectedRows returns the selected rows in row order", () => {
  const rows = [row("a"), row("b"), row("c")];
  const got = selectedRows(rows, new Set(["c", "a"]));
  assert.deepEqual(got.map((r) => r.id), ["a", "c"]);
});

// ── batch-input derivation ───────────────────────────────────────────────────

test("deriveSurfaceBatchInputs writes the surface column + legacy mirror", () => {
  const inputs = deriveSurfaceBatchInputs([row("a")], "talent_profile", false);
  assert.equal(inputs.length, 1);
  const i = inputs[0];
  assert.equal(i.item_ref, "a");
  assert.equal(i.source, "code");
  assert.equal(i.talent_profile_enabled, false);
  // legacy talent mirror = AND(profile, shell); profile flipped off ⇒ false.
  assert.equal(i.talent_enabled, false);
  // workspace surfaces untouched (default true) ⇒ legacy workspace stays true.
  assert.equal(i.workspace_enabled, true);
});

test("deriveSurfaceBatchInputs enabling a talent surface keeps legacy talent true", () => {
  const inputs = deriveSurfaceBatchInputs([row("a")], "talent_shell", true);
  assert.equal(inputs[0].talent_shell_enabled, true);
  assert.equal(inputs[0].talent_enabled, true);
});

test("deriveSurfaceBatchInputs SKIPS rows whose target_context forbids the surface", () => {
  const rows = [
    row("talentOnly", { targetContext: "talent" }),
    row("both", { targetContext: "both" }),
  ];
  // workspace_page is not allowed for a talent-only row → only "both" survives.
  const inputs = deriveSurfaceBatchInputs(rows, "workspace_page", true);
  assert.deepEqual(inputs.map((i) => i.item_ref), ["both"]);
});

test("deriveSurfaceBatchInputs reads the current four-surface state from the overlay", () => {
  // talent_shell already off in the overlay; flip workspace_page → talent legacy
  // must reflect the still-off shell.
  const r = row("a", {
    overlay: {
      item_ref: "a",
      source: "code",
      talent_profile_enabled: true,
      talent_shell_enabled: false,
      workspace_page_enabled: true,
      workspace_shell_enabled: true,
    } as CatalogAdminItem["overlay"],
  });
  const inputs = deriveSurfaceBatchInputs([r], "workspace_page", false);
  // talent legacy = AND(profile=true, shell=false) = false (preserved).
  assert.equal(inputs[0].talent_enabled, false);
  // workspace legacy = AND(page=false now, shell=true) = false.
  assert.equal(inputs[0].workspace_enabled, false);
  assert.equal(inputs[0].workspace_page_enabled, false);
});

test("deriveAvailabilityBatchInputs maps every row to an availability_override", () => {
  const rows = [row("a"), row("b", { source: "template" })];
  const hide = deriveAvailabilityBatchInputs(rows, "hidden");
  assert.deepEqual(hide.map((i) => i.availability_override), ["hidden", "hidden"]);
  assert.deepEqual(hide.map((i) => i.item_ref), ["a", "b"]);
  assert.equal(hide[1].source, "template");
  const show = deriveAvailabilityBatchInputs(rows, "available");
  assert.deepEqual(show.map((i) => i.availability_override), ["available", "available"]);
});

test("deriveResetRefs returns every selected row's item_ref", () => {
  assert.deepEqual(deriveResetRefs([row("a"), row("b")]), ["a", "b"]);
  assert.deepEqual(deriveResetRefs([]), []);
});

// ── P2: batch-outcome summary ────────────────────────────────────────────────

test("summarizeBatchResults counts applied + per-item failures (all attempted)", () => {
  const s = summarizeBatchResults(
    [
      { item_ref: "a", ok: true },
      { item_ref: "b", ok: true },
      { item_ref: "c", ok: false, error: "nope" },
    ],
    3,
    3,
  );
  assert.deepEqual(
    { applied: s.applied, skipped: s.skipped, failed: s.failed },
    { applied: 2, skipped: 0, failed: 1 },
  );
  assert.equal(s.message, "2 applied · 1 failed");
});

test("summarizeBatchResults derives client-skipped from selected − attempted", () => {
  // 5 selected, derivation only produced 3 inputs (2 forbidden-target rows),
  // all 3 written ok.
  const s = summarizeBatchResults(
    [
      { item_ref: "a", ok: true },
      { item_ref: "b", ok: true },
      { item_ref: "c", ok: true },
    ],
    3,
    5,
  );
  assert.deepEqual(
    { applied: s.applied, skipped: s.skipped, failed: s.failed },
    { applied: 3, skipped: 2, failed: 0 },
  );
  assert.equal(s.message, "3 applied · 2 skipped");
});

test("summarizeBatchResults never reports a negative skipped count", () => {
  const s = summarizeBatchResults([{ item_ref: "a", ok: true }], 3, 1);
  assert.equal(s.skipped, 0);
});

test("summarizeBatchResults — fully clean run reads as just N applied", () => {
  const s = summarizeBatchResults(
    [{ item_ref: "a", ok: true }, { item_ref: "b", ok: true }],
    2,
    2,
  );
  assert.equal(s.message, "2 applied");
});

test("failedRefs returns only the per-item failures, keeping them retryable", () => {
  const refs = failedRefs([
    { item_ref: "a", ok: true },
    { item_ref: "b", ok: false, error: "x" },
    { item_ref: "c", ok: false },
  ]);
  assert.deepEqual([...refs].sort(), ["b", "c"]);
});

// ── P2: usage aggregate for the bulk-hide confirm ────────────────────────────

test("summarizeUsageForRows counts used vs unknown (undefined) usageCount", () => {
  const rows = [
    row("a", { usageCount: 3 }),
    row("b", { usageCount: 0 }),
    row("c", { usageCount: 1 }),
    row("d"), // undefined → unknown
  ];
  const agg = summarizeUsageForRows(rows);
  assert.deepEqual(agg, { total: 4, used: 2, unknown: 1 });
});

test("summarizeUsageForRows treats undefined as unknown, not zero", () => {
  const agg = summarizeUsageForRows([row("a"), row("b")]);
  assert.deepEqual(agg, { total: 2, used: 0, unknown: 2 });
});
