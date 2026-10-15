import assert from "node:assert/strict";
import test from "node:test";

import { clientAccountEntitled, resolveClientAccountEntry } from "./entry-visibility";

const base = { flagOn: true, setting: "auto" as const, acceptingBookings: true, entitled: true };

test("flag off hides the entry whatever the site says", () => {
  assert.equal(resolveClientAccountEntry({ ...base, flagOn: false, setting: "show" }), false);
});

test("auto: on when the site takes bookings, off when it does not", () => {
  assert.equal(resolveClientAccountEntry(base), true);
  assert.equal(resolveClientAccountEntry({ ...base, acceptingBookings: false }), false);
});

test("explicit show / hide beat the smart default", () => {
  assert.equal(resolveClientAccountEntry({ ...base, setting: "hide" }), false);
  assert.equal(resolveClientAccountEntry({ ...base, setting: "show", acceptingBookings: false }), true);
});

test("no entitlement hides the entry even when the site chose show", () => {
  assert.equal(resolveClientAccountEntry({ ...base, setting: "show", entitled: false }), false);
});

test("entitlement: every plan today; CLIENT_ACCOUNT_ENTITLED_PLANS narrows it without a code change", () => {
  const saved = process.env.CLIENT_ACCOUNT_ENTITLED_PLANS;
  try {
    delete process.env.CLIENT_ACCOUNT_ENTITLED_PLANS;
    assert.equal(clientAccountEntitled("talent_basic"), true);
    assert.equal(clientAccountEntitled(null), true);
    process.env.CLIENT_ACCOUNT_ENTITLED_PLANS = "talent_portfolio";
    assert.equal(clientAccountEntitled("talent_portfolio"), true);
    assert.equal(clientAccountEntitled("talent_basic"), false);
  } finally {
    if (saved === undefined) delete process.env.CLIENT_ACCOUNT_ENTITLED_PLANS;
    else process.env.CLIENT_ACCOUNT_ENTITLED_PLANS = saved;
  }
});
