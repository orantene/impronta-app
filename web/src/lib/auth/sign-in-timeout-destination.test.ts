import assert from "node:assert/strict";
import { test } from "node:test";

import { signInTimeoutDestination } from "./sign-in-timeout-destination";

test("a safe requested next is kept; its query string survives", () => {
  assert.equal(signInTimeoutDestination("/qa-journeys/admin"), "/qa-journeys/admin");
  assert.equal(signInTimeoutDestination("/client/inquiries?x=1"), "/client/inquiries?x=1");
});

test("no next goes to / (which re-resolves the surface from the session), not to onboarding", () => {
  assert.equal(signInTimeoutDestination(undefined), "/");
  assert.equal(signInTimeoutDestination(null), "/");
  assert.equal(signInTimeoutDestination(""), "/");
  assert.notEqual(signInTimeoutDestination(undefined), "/onboarding/role");
});

test("an unsafe next (protocol-relative, absolute, encoded tricks) falls back to /", () => {
  for (const bad of ["//evil.example", "https://evil.example/x", "/%2F%2Fevil.example", "/en//evil.example", "javascript:alert(1)"]) {
    assert.equal(signInTimeoutDestination(bad), "/", bad);
  }
});
