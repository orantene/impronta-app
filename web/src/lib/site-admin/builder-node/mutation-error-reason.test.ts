import assert from "node:assert/strict";
import test from "node:test";

import {
  describeMutationError,
  MUTATION_ERROR_REASONS,
  UNKNOWN_MUTATION_REASON,
} from "./mutation-error-reason";

const KNOWN_CODES = [
  "NODE_NOT_FOUND", "NODE_AMBIGUOUS", "NODE_KIND_NOT_DUPLICABLE", "PARENT_NOT_FOUND",
  "PARENT_DOES_NOT_ALLOW_CHILDREN", "ROOT_KIND_NOT_ALLOWED", "CHILD_KIND_NOT_ALLOWED",
  "INVALID_MOVE_TARGET", "VALIDATION_FAILED", "NO_CHANGE", "GUARDED_NODE",
  "VERSION_CONFLICT", "SAVE_FAILED",
];

test("every known code has a non-empty es and en reason, no em dashes, no raw code", () => {
  assert.deepEqual(Object.keys(MUTATION_ERROR_REASONS).sort(), [...KNOWN_CODES].sort());
  for (const [code, text] of Object.entries(MUTATION_ERROR_REASONS)) {
    for (const locale of ["en", "es"] as const) {
      assert.ok(text[locale].trim().length > 20, `${code} ${locale}`);
      assert.ok(!text[locale].includes("—"), `${code} ${locale} em dash`);
      assert.ok(!text[locale].includes(code), `${code} ${locale} leaks the code`);
    }
    assert.notEqual(text.en, text.es);
  }
});

test("headline and reason never show the raw code; unknown codes fall back", () => {
  for (const code of [...KNOWN_CODES, "WHATEVER", undefined]) {
    for (const locale of ["en", "es"] as const) {
      const r = describeMutationError({ code, operation: "move", locale });
      assert.ok(r.headline.length > 0 && r.reason.length > 0);
      if (code) assert.ok(!r.headline.includes(code) && !r.reason.includes(code));
    }
  }
  assert.equal(describeMutationError({ code: "WHATEVER", locale: "en" }).reason, UNKNOWN_MUTATION_REASON.en);
  assert.equal(describeMutationError({ code: "toString", locale: "es" }).reason, UNKNOWN_MUTATION_REASON.es);
});

test("headline follows the operation and locale", () => {
  assert.equal(describeMutationError({ code: "NO_CHANGE", operation: "insert", locale: "en" }).headline, "Couldn't add that block");
  assert.equal(describeMutationError({ code: "NO_CHANGE", operation: "remove", locale: "es" }).headline, "No se pudo eliminar ese bloque");
});
