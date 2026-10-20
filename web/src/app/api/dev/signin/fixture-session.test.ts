/**
 * D-173: the first /api/dev/signin for a brand-new @impronta.test address
 * answered 401 and the second 307, because the route minted a link before
 * the user existed. The ordering is create → mint → verify, once.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { mintFixtureSession, type FixtureAdmin, type FixtureVerify } from "./fixture-session";

function fakes(opts: { exists?: boolean; createFails?: string } = {}) {
  const calls: string[] = [];
  let created = Boolean(opts.exists);
  const admin: FixtureAdmin = {
    createUser: async () => {
      calls.push("createUser");
      if (opts.createFails) return { error: { message: opts.createFails } };
      if (created) return { error: { message: "A user with this email address has already been registered" } };
      created = true;
      return { error: null };
    },
    generateLink: async () => {
      calls.push("generateLink");
      // A link minted before the user exists is not a magic link the verifier
      // accepts (the old first-call 401); after creation it is.
      if (!created) return { data: { properties: { hashed_token: "signup-token" } }, error: null };
      return { data: { properties: { hashed_token: `magic-${calls.filter((c) => c === "generateLink").length}` } }, error: null };
    },
  };
  const verified: string[] = [];
  const verify: FixtureVerify = async (input) => {
    calls.push("verifyOtp");
    verified.push(input.token_hash);
    if (!input.token_hash.startsWith("magic-")) return { error: { message: "Email link is invalid or has expired" } };
    return { error: null };
  };
  return { admin, verify, calls, verified };
}

test("a brand-new fixture address signs in on the FIRST call: create, then mint, then verify", async () => {
  const f = fakes();
  const result = await mintFixtureSession(f.admin, f.verify, "new-person@impronta.test", { allowCreate: true });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(f.calls, ["createUser", "generateLink", "verifyOtp"]);
  assert.deepEqual(f.verified, ["magic-1"], "the token verified is the one minted after creation");
});

test("an existing fixture address is tolerated on create and signs in with one mint", async () => {
  const f = fakes({ exists: true });
  const result = await mintFixtureSession(f.admin, f.verify, "qa-journeys-owner@impronta.test", { allowCreate: true });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(f.calls, ["createUser", "generateLink", "verifyOtp"]);
});

test("a real create failure stops before any link is minted", async () => {
  const f = fakes({ createFails: "Database error creating new user" });
  const result = await mintFixtureSession(f.admin, f.verify, "x@impronta.test", { allowCreate: true });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 500);
  assert.deepEqual(f.calls, ["createUser"]);
});

// TUL-1352: a missing fixture user is created only when the explicit flag is set.
test("without the create flag a missing fixture user is refused, naming the account, and nothing is created", async () => {
  const f = fakes();
  const result = await mintFixtureSession(f.admin, f.verify, "ghost@impronta.test", {
    allowCreate: false,
    userExists: async () => false,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 404);
    assert.match(result.message, /ghost@impronta\.test/);
  }
  assert.deepEqual(f.calls, []);
});

test("without the create flag an existing fixture user still signs in, with no createUser call", async () => {
  const f = fakes({ exists: true });
  const result = await mintFixtureSession(f.admin, f.verify, "qa-journeys-owner@impronta.test", {
    allowCreate: false,
    userExists: async () => true,
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(f.calls, ["generateLink", "verifyOtp"]);
});

test("with the create flag a missing fixture user is created then signed in", async () => {
  const f = fakes();
  const result = await mintFixtureSession(f.admin, f.verify, "new@impronta.test", {
    allowCreate: true,
    userExists: async () => false,
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(f.calls, ["createUser", "generateLink", "verifyOtp"]);
});

test("the default (no options) never creates: it refuses when it cannot confirm the user exists", async () => {
  const f = fakes();
  const result = await mintFixtureSession(f.admin, f.verify, "x@impronta.test");
  assert.equal(result.ok, false);
  assert.deepEqual(f.calls, []);
});
