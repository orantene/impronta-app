import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEND_COOLDOWN_SECONDS,
  accountInitials,
  isClientAccountEligible,
  resendSecondsLeft,
  shapeAccountSummary,
} from "./pure";

test("resend cooldown is 30 s, counts down and reaches 0", () => {
  assert.equal(RESEND_COOLDOWN_SECONDS, 30);
  assert.equal(resendSecondsLeft(1000, null), 0);
  assert.equal(resendSecondsLeft(1000, 1000), 30);
  assert.equal(resendSecondsLeft(1000 + 12_500, 1000), 18);
  assert.equal(resendSecondsLeft(1000 + 30_000, 1000), 0);
  assert.equal(resendSecondsLeft(1000 + 99_000, 1000), 0);
  assert.equal(resendSecondsLeft(0, 5000), 30, "a clock skewed backwards never exceeds the cooldown");
});

test("initials: name, single name, email fallback, nothing", () => {
  assert.equal(accountInitials("Ana María López", null), "AL");
  assert.equal(accountInitials("  maria ", null), "M");
  assert.equal(accountInitials(null, "juan.perez@example.com"), "JP");
  assert.equal(accountInitials("", ""), "?");
  assert.equal(accountInitials(undefined, undefined), "?");
});

test("only client accounts are eligible; talent, staff, platform are not", () => {
  assert.equal(isClientAccountEligible("client"), true);
  assert.equal(isClientAccountEligible(null), true);
  for (const r of ["talent", "agency_staff", "super_admin"]) assert.equal(isClientAccountEligible(r), false, r);
});

const NOW = Date.parse("2026-10-07T12:00:00Z");

test("summary empty state", () => {
  const s = shapeAccountSummary({ upcoming: [], unread: 0, nowMs: NOW, timeZone: "America/Mexico_City", locale: "en" });
  assert.deepEqual(s, { nextVisit: null, unread: 0, balanceDue: null });
});

test("summary picks the soonest visit and formats in the talent's timezone", () => {
  const s = shapeAccountSummary({
    upcoming: [
      { title: "Later", eventDate: "2026-10-20T20:00:00Z", status: "x", amountCents: null, currencyCode: null, paymentStatus: null },
      { title: "Gel manicure", eventDate: "2026-10-09T21:30:00Z", status: "x", amountCents: 50000, currencyCode: "MXN", paymentStatus: "partial" },
      { title: "Past", eventDate: "2026-09-01T10:00:00Z", status: "x", amountCents: 9900, currencyCode: "MXN", paymentStatus: "unpaid" },
    ],
    unread: 3,
    nowMs: NOW,
    timeZone: "America/Mexico_City",
    locale: "en",
  });
  assert.equal(s.nextVisit?.service, "Gel manicure");
  assert.match(s.nextVisit!.timeLabel, /3:30/);
  assert.equal(s.unread, 3);
  assert.deepEqual(s.balanceDue, { amountCents: 59900, currencyCode: "MXN" });
});

test("summary: paid bookings owe nothing, bad timezone falls back, negative unread clamps", () => {
  const s = shapeAccountSummary({
    upcoming: [{ title: null, eventDate: "2026-10-09T21:30:00Z", status: null, amountCents: 100, currencyCode: "USD", paymentStatus: "paid" }],
    unread: -4,
    nowMs: NOW,
    timeZone: "Not/AZone",
    locale: "es",
  });
  assert.equal(s.balanceDue, null);
  assert.equal(s.unread, 0);
  assert.equal(s.nextVisit?.service, null);
  assert.ok(s.nextVisit?.dateLabel);
});

test("mixed currencies never sum across currencies", () => {
  const s = shapeAccountSummary({
    upcoming: [
      { title: "a", eventDate: null, status: null, amountCents: 100, currencyCode: "USD", paymentStatus: "unpaid" },
      { title: "b", eventDate: null, status: null, amountCents: 900, currencyCode: "MXN", paymentStatus: "unpaid" },
    ],
    unread: 0,
    nowMs: NOW,
    timeZone: "UTC",
    locale: "en",
  });
  assert.deepEqual(s.balanceDue, { amountCents: 100, currencyCode: "USD" });
});
