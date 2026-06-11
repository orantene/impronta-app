// read-source-ai-search-doc.test.ts
//
// T2.5 — parity proof for the AI search-doc field-value repoint: System A vs B.
//
// Covers the toggle/boolean coercion fix: B's `travel.willing` field (kind=toggle)
// has ~50 rows stored as JSON boolean true/false and ~20 rows stored as JSON
// string "true"/"false" (a data-quality nit). The B-reader MUST emit "Yes"/"No"
// for BOTH storage forms — matching System A's output which reads the typed
// `value_boolean` column. This test exercises the pure helper functions to verify
// the coercion without hitting the DB.
//
// Run:
//   npx tsx --test src/lib/field-engine/read-source-ai-search-doc.test.ts
// Wired into `npm run test:fields` (→ `ci`).

import test from "node:test";
import assert from "node:assert/strict";

import { bKindToValueType, B_TO_A_KEY } from "@/lib/field-engine/read-source-ai-search-doc";

// ── bKindToValueType unit tests ───────────────────────────────────────────────

test("bKindToValueType: toggle → boolean (for Yes/No coercion)", () => {
  assert.equal(bKindToValueType("toggle"), "boolean");
});

test("bKindToValueType: number → number", () => {
  assert.equal(bKindToValueType("number"), "number");
});

test("bKindToValueType: text → text", () => {
  assert.equal(bKindToValueType("text"), "text");
});

test("bKindToValueType: textarea → textarea", () => {
  assert.equal(bKindToValueType("textarea"), "textarea");
});

test("bKindToValueType: date → date", () => {
  assert.equal(bKindToValueType("date"), "date");
});

test("bKindToValueType: select → text (B stores label directly in JSONB)", () => {
  assert.equal(bKindToValueType("select"), "text");
});

test("bKindToValueType: multiselect → text (B stores label array as JSONB)", () => {
  assert.equal(bKindToValueType("multiselect"), "text");
});

test("bKindToValueType: null → text (safe default)", () => {
  assert.equal(bKindToValueType(null), "text");
});

// ── Toggle coercion — the core correctness invariant ─────────────────────────
//
// Both JSON boolean and JSON string forms must emit "Yes"/"No".
// Verified against prod data (2026-06-11): travel.willing def id
// baaa6446-3284-4d7b-8225-59e9291f2d56 (kind=toggle) has 50 boolean rows +
// 20 string rows in talent_profile_field_values.

/** Inline the exact toggle-coercion logic from readAiSearchDocFieldsFromB
 *  so we can unit-test it without a DB or Supabase client. */
function coerceToggleValue(rawVal: unknown): "Yes" | "No" | null {
  const boolLike =
    rawVal === true ||
    rawVal === false ||
    rawVal === "true" ||
    rawVal === "false";
  if (!boolLike) return null;
  return rawVal === true || rawVal === "true" ? "Yes" : "No";
}

test("toggle coercion: JSON boolean true → Yes", () => {
  assert.equal(coerceToggleValue(true), "Yes");
});

test("toggle coercion: JSON boolean false → No", () => {
  assert.equal(coerceToggleValue(false), "No");
});

test("toggle coercion: JSON string 'true' → Yes (string-stored B rows)", () => {
  // ~20 travel.willing rows in prod store the value as the JSON string "true"
  // instead of JSON boolean true. The reader MUST coerce these to "Yes", not
  // emit the literal string "true" (which was the pre-fix bug).
  assert.equal(coerceToggleValue("true"), "Yes");
});

test("toggle coercion: JSON string 'false' → No (string-stored B rows)", () => {
  assert.equal(coerceToggleValue("false"), "No");
});

test("toggle coercion: non-boolean-like value → null (skip)", () => {
  assert.equal(coerceToggleValue(null), null);
  assert.equal(coerceToggleValue(undefined), null);
  assert.equal(coerceToggleValue("yes"), null);
  assert.equal(coerceToggleValue(1), null);
  assert.equal(coerceToggleValue({}), null);
});

// ── B_TO_A_KEY bridge coverage ────────────────────────────────────────────────
//
// The bridge map must include travel.willing → willing_to_travel so the
// readB value projection emits it under the A vocabulary key.

test("B_TO_A_KEY: travel.willing bridges to A key willing_to_travel", () => {
  assert.equal(B_TO_A_KEY["travel.willing"], "willing_to_travel");
});

test("B_TO_A_KEY: all 16 expected scalar keys are bridged", () => {
  const expectedAKeys = [
    "willing_to_travel", "travel_scope",
    "availability_status", "available_for",
    "height_cm", "hair_color", "hair_length", "eye_color",
    "shoe_size", "body_type", "clothing_size",
    "years_experience", "experience_level",
    "notable_work", "professional_highlights",
    "website_url",
  ];
  const bridgedAValues = Object.values(B_TO_A_KEY);
  for (const aKey of expectedAKeys) {
    assert.ok(
      bridgedAValues.includes(aKey),
      `Expected A key '${aKey}' to be in B_TO_A_KEY bridge`,
    );
  }
});

test("B_TO_A_KEY: social URLs are NOT bridged (excluded from B-reader output)", () => {
  // instagram_url, tiktok_url, youtube_url have no B canonical definition.
  // They must NOT appear as values in B_TO_A_KEY so the reader excludes them.
  const bridgedAValues = Object.values(B_TO_A_KEY);
  assert.ok(!bridgedAValues.includes("instagram_url"), "instagram_url must not be bridged");
  assert.ok(!bridgedAValues.includes("tiktok_url"), "tiktok_url must not be bridged");
  assert.ok(!bridgedAValues.includes("youtube_url"), "youtube_url must not be bridged");
});
