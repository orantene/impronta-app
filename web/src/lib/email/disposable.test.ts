import assert from "node:assert/strict";
import { test } from "node:test";

import { getDisposableDomainCount, isDisposableEmail } from "./disposable";

test("blocks known throwaway providers, including subdomains", () => {
  assert.equal(isDisposableEmail("someone@guerrillamail.com"), true);
  assert.equal(isDisposableEmail("someone@mailinator.com"), true);
  assert.equal(isDisposableEmail("someone@a.b.mailinator.com"), true);
});

test("never blocks free providers real clients actually use", () => {
  for (const addr of ["a@gmail.com", "b@yahoo.com", "c@outlook.com", "d@hotmail.com"]) {
    assert.equal(isDisposableEmail(addr), false, `${addr} must not be blocked`);
  }
});

test("malformed input is not treated as disposable", () => {
  assert.equal(isDisposableEmail(""), false);
  assert.equal(isDisposableEmail("no-at-sign"), false);
});

test("the denylist is non-trivial", () => {
  assert.ok(getDisposableDomainCount() > 100);
});

// ─── QA_EMAIL_DOMAIN escape hatch ───────────────────────────────────────────
//
// Regression guard for the bounce incident. With no deliverable address the
// guard permits, QA invents addresses at a real provider — and they hard
// bounce. During guest-support QA, mailinator was rejected, so QA moved to
// fabricated `…@gmail.com` addresses: 5 of 9 sends hard bounced, while the one
// mailinator send delivered fine. Bounces are the worse outcome by far, since
// Gmail's hard-bounce threshold is well under 1% and sustained bounces throttle
// the whole sending domain, degrading password resets and booking mail too.

test("QA_EMAIL_DOMAIN lets a designated inbox through, including subdomains", () => {
  const prev = process.env.QA_EMAIL_DOMAIN;
  process.env.QA_EMAIL_DOMAIN = "mailinator.com";
  try {
    assert.equal(isDisposableEmail("qa-guest@mailinator.com"), false);
    assert.equal(isDisposableEmail("qa@team.mailinator.com"), false);
    // Everything else on the denylist is unaffected.
    assert.equal(isDisposableEmail("someone@guerrillamail.com"), true);
  } finally {
    if (prev === undefined) delete process.env.QA_EMAIL_DOMAIN;
    else process.env.QA_EMAIL_DOMAIN = prev;
  }
});

test("unset QA_EMAIL_DOMAIN is a no-op: the denylist behaves exactly as before", () => {
  const prev = process.env.QA_EMAIL_DOMAIN;
  delete process.env.QA_EMAIL_DOMAIN;
  try {
    assert.equal(isDisposableEmail("qa-guest@mailinator.com"), true);
    assert.equal(isDisposableEmail("real.person@gmail.com"), false);
  } finally {
    if (prev !== undefined) process.env.QA_EMAIL_DOMAIN = prev;
  }
});
