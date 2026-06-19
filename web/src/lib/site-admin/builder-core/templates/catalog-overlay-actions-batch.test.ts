/**
 * catalog-overlay-actions-batch.test.ts — unit tests for the O1 batch-overlay
 * payload shaping, deduplication, and guard logic.
 *
 * Previously this file re-implemented buildBatchPayloads as a LOCAL MIRROR that
 * had drifted: it omitted the X4 per-surface toggles (talent_profile_enabled,
 * talent_shell_enabled, workspace_page_enabled, workspace_shell_enabled) and
 * the X6 lab_enabled toggle, and had no guard coverage.
 *
 * This revision imports the REAL helpers from catalog-overlay-payload.ts so any
 * change to the real implementation is immediately caught by the tests here.
 *
 * Test runner: node:test + node:assert/strict (tsx --test).
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/builder-core/templates/catalog-overlay-actions-batch.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { SetCatalogOverlayInput } from "@/lib/site-admin/add-gallery/registry-db-merge";
import {
  buildOverlayPayload,
  buildBatchPayloads,
  checkSurfaceGuard,
  enablingSurfaceKeys,
} from "./catalog-overlay-payload";

/**
 * Mirrors the deduplication step of `clearComponentOverlayBatch`.
 * (This is purely local dedup logic — not extracted to the helper — because
 * `clearComponentOverlayBatch` takes `string[]`, not `SetCatalogOverlayInput[]`.)
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

// ── X4 per-surface toggles (the drift that motivated this refactor) ──────────

test("payload includes X4 per-surface toggles when provided", () => {
  const input: SetCatalogOverlayInput = {
    item_ref: "el-btn",
    source: "code",
    talent_profile_enabled: true,
    talent_shell_enabled: false,
    workspace_page_enabled: true,
    workspace_shell_enabled: false,
    lab_enabled: false,
  };
  const p = buildOverlayPayload(input, "u-test");
  // All four X4 toggles must appear with the correct value.
  assert.equal(p.talent_profile_enabled, true, "talent_profile_enabled present");
  assert.equal(p.talent_shell_enabled, false, "talent_shell_enabled present");
  assert.equal(p.workspace_page_enabled, true, "workspace_page_enabled present");
  assert.equal(p.workspace_shell_enabled, false, "workspace_shell_enabled present");
  // X6 — lab axis.
  assert.equal(p.lab_enabled, false, "lab_enabled present");
});

test("payload includes X6 lab_enabled when provided", () => {
  const input: SetCatalogOverlayInput = {
    item_ref: "el-btn",
    source: "code",
    lab_enabled: false,
  };
  const p = buildOverlayPayload(input, "u-test");
  assert.equal(p.lab_enabled, false, "lab_enabled is false (not undefined)");
});

test("X4 toggles absent from payload when not provided (no accidental overwrite)", () => {
  const input: SetCatalogOverlayInput = {
    item_ref: "el-btn",
    source: "code",
    // No X4 / X6 fields — must not appear in payload.
  };
  const p = buildOverlayPayload(input, "u-test");
  assert.equal(p.talent_profile_enabled, undefined, "talent_profile_enabled absent");
  assert.equal(p.talent_shell_enabled, undefined, "talent_shell_enabled absent");
  assert.equal(p.workspace_page_enabled, undefined, "workspace_page_enabled absent");
  assert.equal(p.workspace_shell_enabled, undefined, "workspace_shell_enabled absent");
  assert.equal(p.lab_enabled, undefined, "lab_enabled absent");
});

// ── X3 tighten-only guard ────────────────────────────────────────────────────

test("guard rejects enabling a talent surface on a workspace-targeted template", () => {
  const violation = checkSurfaceGuard(
    { item_ref: "db-template:x", source: "template", talent_profile_enabled: true },
    "workspace",
  );
  assert.ok(violation !== null, "violation must be a non-null string");
  assert.ok(typeof violation === "string" && violation.length > 0, "violation is a non-empty string");
  assert.ok(violation.includes("workspace"), "violation message mentions the target context");
  assert.ok(violation.includes("talent_profile"), "violation message mentions the offending surface");
});

test("guard rejects enabling a workspace surface on a talent-targeted template", () => {
  const violation = checkSurfaceGuard(
    { item_ref: "db-template:x", source: "template", workspace_page_enabled: true },
    "talent",
  );
  assert.ok(violation !== null, "violation must be a non-null string");
  assert.ok(violation!.includes("workspace_page"), "violation mentions workspace_page");
});

test("guard passes enabling a workspace surface on a workspace-targeted template", () => {
  const result = checkSurfaceGuard(
    { item_ref: "db-template:x", source: "template", workspace_page_enabled: true },
    "workspace",
  );
  assert.equal(result, null, "workspace surface on workspace target → null (ok)");
});

test("guard passes enabling a talent surface on a talent-targeted template", () => {
  const result = checkSurfaceGuard(
    { item_ref: "db-template:x", source: "template", talent_profile_enabled: true },
    "talent",
  );
  assert.equal(result, null, "talent surface on talent target → null (ok)");
});

test("guard passes for 'both' target context regardless of surface", () => {
  const result = checkSurfaceGuard(
    {
      item_ref: "db-template:x",
      source: "template",
      talent_profile_enabled: true,
      workspace_page_enabled: true,
    },
    "both",
  );
  assert.equal(result, null, "both target → null (all surfaces ok)");
});

test("guard passes for 'platform' target context", () => {
  const result = checkSurfaceGuard(
    { item_ref: "db-template:x", source: "template", workspace_shell_enabled: true },
    "platform",
  );
  assert.equal(result, null, "platform target → null (all surfaces ok)");
});

test("guard passes when no surfaces are being enabled (disable-only write)", () => {
  // Disabling surfaces always passes regardless of target_context.
  const result = checkSurfaceGuard(
    {
      item_ref: "db-template:x",
      source: "template",
      talent_profile_enabled: false,
      workspace_page_enabled: false,
    },
    "workspace",
  );
  assert.equal(result, null, "disable-only write → null (ok)");
});

test("enablingSurfaceKeys: only keys being set to true are returned", () => {
  const input: SetCatalogOverlayInput = {
    item_ref: "el-btn",
    source: "code",
    talent_profile_enabled: true,       // enabling
    talent_shell_enabled: false,        // NOT enabling (false)
    workspace_page_enabled: true,       // enabling
    // workspace_shell_enabled: not set  // NOT enabling (absent)
  };
  const keys = enablingSurfaceKeys(input);
  assert.ok(keys.includes("talent_profile"), "talent_profile is enabling");
  assert.ok(keys.includes("workspace_page"), "workspace_page is enabling");
  assert.ok(!keys.includes("talent_shell"), "talent_shell is NOT enabling");
  assert.ok(!keys.includes("workspace_shell"), "workspace_shell is NOT enabling");
  assert.equal(keys.length, 2, "exactly 2 enabling keys");
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
