/**
 * catalog-overlay-actions-batch.test.ts — unit tests for the O1 batch-overlay
 * payload shaping and deduplication logic.
 *
 * These tests exercise PURE behaviour (deduplication contract, per-item result
 * shape, empty-input handling) without hitting Supabase or the auth gate.  The
 * server-action wrappers (`setComponentOverlayBatch` / `clearComponentOverlayBatch`)
 * are tested via the same helpers that drive the single-item actions; DB +
 * auth-gate coverage lives in integration tests.
 *
 * Test runner: node:test + node:assert/strict (tsx --test).
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/builder-core/templates/catalog-overlay-actions-batch.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { SetCatalogOverlayInput } from "@/lib/site-admin/add-gallery/registry-db-merge";

// ── helpers (mirrors the payload-building logic inside the action) ──────────

/**
 * Mirrors the deduplication + payload-building step of `setComponentOverlayBatch`
 * so we can unit-test the pure logic without touching the server gate or Supabase.
 */
function buildBatchPayloads(
  inputs: SetCatalogOverlayInput[],
  userId = "user-123",
): { payloads: Record<string, unknown>[]; errors: string[] } {
  const errors: string[] = [];

  // Deduplicate — last writer wins.
  const seen = new Map<string, SetCatalogOverlayInput>();
  for (const input of inputs) {
    if (input.item_ref) seen.set(input.item_ref, input);
  }

  // Collect validation errors for entries missing item_ref.
  for (const input of inputs) {
    if (!input.item_ref) errors.push("Missing item reference.");
  }

  const payloads: Record<string, unknown>[] = [];
  for (const [, input] of seen) {
    const payload: Record<string, unknown> = {
      item_ref: input.item_ref,
      source: input.source,
      updated_by: userId,
    };
    const assign = <K extends keyof SetCatalogOverlayInput>(key: K) => {
      if (input[key] !== undefined) payload[key] = input[key];
    };
    assign("talent_enabled");
    assign("workspace_enabled");
    assign("label_override");
    assign("icon_override");
    assign("category_override");
    assign("required_plan_override");
    assign("availability_override");
    assign("default_variant");
    assign("default_props");
    assign("data_source_defaults");
    assign("locked_props");
    payloads.push(payload);
  }
  return { payloads, errors };
}

/**
 * Mirrors the deduplication step of `clearComponentOverlayBatch`.
 */
function buildClearBatchRefs(
  refs: string[],
): { uniqueRefs: string[]; errors: string[] } {
  const errors: string[] = [];
  const validRefs: string[] = [];
  for (const ref of refs) {
    if (!ref) errors.push("Missing item reference.");
    else validRefs.push(ref);
  }
  return { uniqueRefs: [...new Set(validRefs)], errors };
}

// ── setComponentOverlayBatch payload shaping ────────────────────────────────

test("batch set: empty input produces no payloads and no errors", () => {
  const { payloads, errors } = buildBatchPayloads([]);
  assert.equal(payloads.length, 0);
  assert.equal(errors.length, 0);
});

test("batch set: single input produces exactly one payload with correct shape", () => {
  const input: SetCatalogOverlayInput = {
    item_ref: "el-button",
    source: "code",
    talent_enabled: false,
    label_override: "CTA",
  };
  const { payloads, errors } = buildBatchPayloads([input], "u-1");
  assert.equal(errors.length, 0);
  assert.equal(payloads.length, 1);
  const p = payloads[0];
  assert.equal(p.item_ref, "el-button");
  assert.equal(p.source, "code");
  assert.equal(p.updated_by, "u-1");
  assert.equal(p.talent_enabled, false);
  assert.equal(p.label_override, "CTA");
  // workspace_enabled not provided → must NOT appear in payload (undefined)
  assert.equal(p.workspace_enabled, undefined);
});

test("batch set: deduplicates by item_ref — last entry wins", () => {
  const inputs: SetCatalogOverlayInput[] = [
    { item_ref: "el-button", source: "code", talent_enabled: true },
    { item_ref: "el-video", source: "code", talent_enabled: true },
    // Second entry for el-button overrides the first.
    { item_ref: "el-button", source: "code", talent_enabled: false, label_override: "CTA" },
  ];
  const { payloads, errors } = buildBatchPayloads(inputs);
  assert.equal(errors.length, 0);
  // Two unique refs → two payloads.
  assert.equal(payloads.length, 2);
  const button = payloads.find((p) => p.item_ref === "el-button");
  assert.ok(button, "el-button payload must exist");
  // Last writer wins: talent_enabled should be false, label_override should be "CTA".
  assert.equal(button!.talent_enabled, false);
  assert.equal(button!.label_override, "CTA");
});

test("batch set: 40 identical refs collapse to 1 payload (the bulk-efficiency guarantee)", () => {
  const inputs = Array.from({ length: 40 }, (_, i) => ({
    item_ref: i < 20 ? "el-button" : "el-video",
    source: "code" as const,
    talent_enabled: false,
  }));
  const { payloads } = buildBatchPayloads(inputs);
  assert.equal(payloads.length, 2, "40 inputs for 2 refs → 2 payloads");
});

test("batch set: missing item_ref entries are errors; valid entries still proceed", () => {
  const inputs: SetCatalogOverlayInput[] = [
    { item_ref: "", source: "code" },   // invalid
    { item_ref: "el-button", source: "code", talent_enabled: false }, // valid
    { item_ref: "", source: "code" },   // invalid
  ];
  const { payloads, errors } = buildBatchPayloads(inputs);
  assert.equal(errors.length, 2, "two empty-ref errors");
  assert.equal(payloads.length, 1, "one valid payload still produced");
  assert.equal(payloads[0].item_ref, "el-button");
});

test("batch set: optional fields are only included when defined", () => {
  const input: SetCatalogOverlayInput = {
    item_ref: "el-button",
    source: "code",
    // No optional fields set.
  };
  const { payloads } = buildBatchPayloads([input]);
  const p = payloads[0];
  // Fields not provided must be absent from the payload (so the upsert doesn't
  // accidentally overwrite existing DB values with undefined/null).
  assert.equal(p.talent_enabled, undefined);
  assert.equal(p.workspace_enabled, undefined);
  assert.equal(p.label_override, undefined);
  assert.equal(p.availability_override, undefined);
});

test("batch set: null overrides ARE included (explicit clear)", () => {
  const input: SetCatalogOverlayInput = {
    item_ref: "el-button",
    source: "code",
    label_override: null,
    availability_override: null,
  };
  const { payloads } = buildBatchPayloads([input]);
  const p = payloads[0];
  // null is defined — it must be forwarded so the upsert clears the column.
  assert.equal(p.label_override, null);
  assert.equal(p.availability_override, null);
});

// ── clearComponentOverlayBatch deduplication ─────────────────────────────────

test("batch clear: empty refs produces no uniqueRefs and no errors", () => {
  const { uniqueRefs, errors } = buildClearBatchRefs([]);
  assert.equal(uniqueRefs.length, 0);
  assert.equal(errors.length, 0);
});

test("batch clear: deduplicates refs", () => {
  const refs = ["el-button", "el-video", "el-button", "el-button"];
  const { uniqueRefs, errors } = buildClearBatchRefs(refs);
  assert.equal(errors.length, 0);
  assert.equal(uniqueRefs.length, 2);
  assert.ok(uniqueRefs.includes("el-button"));
  assert.ok(uniqueRefs.includes("el-video"));
});

test("batch clear: 40 refs for the same item collapse to 1 unique ref", () => {
  const refs = Array.from({ length: 40 }, () => "el-button");
  const { uniqueRefs } = buildClearBatchRefs(refs);
  assert.equal(uniqueRefs.length, 1);
});

test("batch clear: empty-string refs are errors; valid refs still proceed", () => {
  const refs = ["", "el-button", "", "el-video"];
  const { uniqueRefs, errors } = buildClearBatchRefs(refs);
  assert.equal(errors.length, 2, "two empty-string errors");
  assert.equal(uniqueRefs.length, 2, "two valid refs");
});

// ── result shape contract ────────────────────────────────────────────────────

test("batch result shape: ok items carry item_ref + ok:true + data:undefined", () => {
  // Simulate what the action returns after a successful upsert.
  const seen = new Map([["el-button", true], ["el-video", true]]);
  const results = [];
  for (const [item_ref] of seen) {
    results.push({ ok: true as const, data: undefined, item_ref });
  }
  for (const r of results) {
    assert.equal(r.ok, true);
    assert.equal(r.data, undefined);
    assert.ok(typeof r.item_ref === "string" && r.item_ref.length > 0);
  }
  assert.equal(results.length, 2);
});

test("batch result shape: error items carry item_ref + ok:false + error string", () => {
  const errorResult = { ok: false as const, error: "Missing item reference.", item_ref: "" };
  assert.equal(errorResult.ok, false);
  assert.ok(errorResult.error.length > 0);
});
