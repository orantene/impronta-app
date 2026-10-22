import assert from "node:assert/strict";
import test from "node:test";

import { discountStatus } from "./discount-status";

const NOW = Date.parse("2026-12-10T12:00:00Z");
const row = (over: Partial<{ isActive: boolean; startsAt: string | null; endsAt: string | null }> = {}) => ({
  isActive: true,
  startsAt: null,
  endsAt: null,
  ...over,
});

test("status derives from the active flag and the date window", () => {
  assert.equal(discountStatus(row(), NOW), "active");
  assert.equal(discountStatus(row({ startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z" }), NOW), "active");
  assert.equal(discountStatus(row({ startsAt: "2026-12-20T00:00:00Z" }), NOW), "scheduled");
  assert.equal(discountStatus(row({ endsAt: "2026-12-09T00:00:00Z" }), NOW), "expired");
  assert.equal(discountStatus(row({ isActive: false }), NOW), "archived");
});

test("archived wins over any window; the edges match validateDiscount (strict > start, strict < end)", () => {
  assert.equal(discountStatus(row({ isActive: false, endsAt: "2026-12-09T00:00:00Z" }), NOW), "archived");
  assert.equal(discountStatus(row({ startsAt: new Date(NOW).toISOString() }), NOW), "active");
  assert.equal(discountStatus(row({ endsAt: new Date(NOW).toISOString() }), NOW), "active");
  assert.equal(discountStatus(row({ endsAt: new Date(NOW - 1).toISOString() }), NOW), "expired");
});

import { bilingualWindowError, discountWindowError } from "./discount-status";

test("create rejects a past end date and a start that is not before the end", () => {
  assert.equal(discountWindowError({ startsAt: null, endsAt: "2026-12-09T00:00:00Z" }, "create", NOW), "endInPast");
  assert.equal(discountWindowError({ startsAt: null, endsAt: new Date(NOW).toISOString() }, "create", NOW), "endInPast");
  assert.equal(discountWindowError({ startsAt: "2026-12-30T00:00:00Z", endsAt: "2026-12-20T00:00:00Z" }, "create", NOW), "startAfterEnd");
  assert.equal(discountWindowError({ startsAt: "2026-12-20T00:00:00Z", endsAt: "2026-12-20T00:00:00Z" }, "create", NOW), "startAfterEnd");
  assert.equal(discountWindowError({ startsAt: "2026-12-11T00:00:00Z", endsAt: "2026-12-31T00:00:00Z" }, "create", NOW), null);
  assert.equal(discountWindowError({ startsAt: null, endsAt: null }, "create", NOW), null);
});

test("edit keeps an already expired code editable but still checks start vs end", () => {
  assert.equal(discountWindowError({ startsAt: null, endsAt: "2026-12-09T00:00:00Z" }, "edit", NOW), null);
  assert.equal(discountWindowError({ startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-09T00:00:00Z" }, "edit", NOW), "startAfterEnd");
});

test("the window errors read in both languages", () => {
  assert.match(bilingualWindowError("endInPast"), /in the past.*ya pas/);
  assert.match(bilingualWindowError("startAfterEnd"), /before the end date.*anterior/);
});
