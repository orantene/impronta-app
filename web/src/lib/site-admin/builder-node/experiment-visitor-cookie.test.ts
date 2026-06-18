import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EXPERIMENT_VISITOR_COOKIE,
  EXPERIMENT_VISITOR_COOKIE_OPTIONS,
  isValidExperimentVisitorId,
  mintExperimentVisitorId,
} from "./experiment-visitor-cookie";

test("mintExperimentVisitorId produces a valid, url-safe id every time", () => {
  for (let i = 0; i < 200; i++) {
    const id = mintExperimentVisitorId();
    assert.ok(isValidExperimentVisitorId(id), `minted id failed validation: ${id}`);
    // url-safe base64 only — no +, /, or = padding.
    assert.ok(!/[+/=]/.test(id), `id has non-url-safe chars: ${id}`);
  }
});

test("mintExperimentVisitorId is effectively unique across calls", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(mintExperimentVisitorId());
  // Collisions in 18 random bytes are astronomically unlikely.
  assert.equal(seen.size, 1000);
});

test("isValidExperimentVisitorId rejects malformed / forged cookies", () => {
  assert.equal(isValidExperimentVisitorId(undefined), false);
  assert.equal(isValidExperimentVisitorId(null), false);
  assert.equal(isValidExperimentVisitorId(""), false);
  assert.equal(isValidExperimentVisitorId("short"), false); // < 16 chars
  assert.equal(isValidExperimentVisitorId("a".repeat(128)), false); // > 64 chars
  assert.equal(isValidExperimentVisitorId("has spaces in it here"), false);
  assert.equal(isValidExperimentVisitorId("inj;ection=attack=value"), false);
  assert.equal(isValidExperimentVisitorId(123 as unknown), false);
  // A well-formed id passes.
  assert.equal(isValidExperimentVisitorId("Abc123Def456Ghi789Xy"), true);
});

test("cookie name + options are first-party, HttpOnly, Lax, Path=/", () => {
  assert.equal(EXPERIMENT_VISITOR_COOKIE, "impronta_vid");
  assert.equal(EXPERIMENT_VISITOR_COOKIE_OPTIONS.httpOnly, true);
  assert.equal(EXPERIMENT_VISITOR_COOKIE_OPTIONS.sameSite, "lax");
  assert.equal(EXPERIMENT_VISITOR_COOKIE_OPTIONS.path, "/");
  assert.ok(EXPERIMENT_VISITOR_COOKIE_OPTIONS.maxAge > 0);
});
