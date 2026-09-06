import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * Expected refusals (wrong password, signup rate limit) must not reach Sentry
 * or the server_error stream. Pins the shape in both the logger and the two
 * auth call sites that produced a week of error-level noise in production.
 */
const logger = readFileSync(path.join(process.cwd(), "src/lib/server/safe-error.ts"), "utf8");
const actions = readFileSync(path.join(process.cwd(), "src/app/auth/actions.ts"), "utf8");

test("logServerExpected never captures to Sentry and never emits server_error", () => {
  const start = logger.indexOf("export function logServerExpected(");
  assert.ok(start > 0, "logServerExpected must exist");
  const end = logger.indexOf("\n}\n", start);
  const body = logger.slice(start, end);
  assert.ok(!body.includes("Sentry."), "no Sentry call in the expected-path logger");
  assert.ok(!body.includes('"server_error"'), "no server_error stream");
  assert.ok(body.includes('"server_expected"'), "emits the server_expected stream");
  assert.ok(body.includes("console.warn"), "warn level, not error");
});

test("a rejected password is logged as expected, other sign-in errors stay errors", () => {
  const fn = actions.slice(actions.indexOf("supabase.auth.signInWithPassword("));
  const block = fn.slice(0, fn.indexOf("return {"));
  assert.ok(block.includes('logServerExpected("auth/signInWithPassword", error)'));
  assert.ok(block.includes('logServerError("auth/signInWithPassword", error)'));
  assert.ok(
    block.indexOf("if (isRejectedCredentials(error)) {") < block.indexOf("logServerExpected("),
    "the expected branch is gated on isRejectedCredentials",
  );
});

test("a signup rate limit is logged as expected, other signup errors stay errors", () => {
  const fn = actions.slice(actions.indexOf("supabase.auth.signUp("));
  const block = fn.slice(0, fn.indexOf("mapSignUpError("));
  assert.ok(block.includes('logServerExpected("auth/signUpWithEmail", error)'));
  assert.ok(block.includes('logServerError("auth/signUpWithEmail", error)'));
  assert.ok(block.indexOf("if (isRateLimited(error)) {") < block.indexOf("logServerExpected("));
});
