import assert from "node:assert/strict";
import test from "node:test";

import {
  CLIENT_AUTH_METHODS,
  RESEND_COOLDOWN_SECONDS,
  accountInitials,
  isClientAccountEligible,
  isClientAuthMethod,
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

test("client auth methods match foundation migration allow-list", () => {
  assert.deepEqual([...CLIENT_AUTH_METHODS], ["email_code", "google", "password", "sso"]);
  for (const m of CLIENT_AUTH_METHODS) assert.equal(isClientAuthMethod(m), true, m);
  assert.equal(isClientAuthMethod("magic_link"), false);
  assert.equal(isClientAuthMethod(""), false);
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

import {
  chooseTrustedHost,
  isApplePrivateRelayEmail,
  isAuthEmailConfirmedForClaim,
  precheckSignIn,
  shouldClaimInquiriesForSignIn,
  shouldSignOutAfterVerify,
  tenantSourceProfileId,
  userHasGoogleIdentity,
  verifyIpRateKey,
} from "./pure";

test("pre-check blocks business sessions only", () => {
  assert.equal(precheckSignIn({ signedIn: true, appRole: "talent" }), "business_session");
  assert.equal(precheckSignIn({ signedIn: true, appRole: "agency_staff" }), "business_session");
  assert.equal(precheckSignIn({ signedIn: true, appRole: "super_admin" }), "business_session");
  assert.equal(precheckSignIn({ signedIn: true, appRole: "client" }), "proceed");
  assert.equal(precheckSignIn({ signedIn: false, appRole: "talent" }), "proceed");
});

test("sign out after a non-client verify only when no prior session", () => {
  assert.equal(shouldSignOutAfterVerify(false), true);
  assert.equal(shouldSignOutAfterVerify(true), false);
});

test("host choice ignores everything but a well-formed host header", () => {
  assert.equal(chooseTrustedHost("Jor.Tulala.Digital"), "jor.tulala.digital");
  assert.equal(chooseTrustedHost("localhost:3001"), "localhost:3001");
  assert.equal(chooseTrustedHost(""), null);
  assert.equal(chooseTrustedHost(null), null);
  assert.equal(chooseTrustedHost("evil.com/x y"), null);
});

test("tenant source: proxy profile header on talent_site hosts only", () => {
  assert.equal(tenantSourceProfileId("talent_site", " abc "), "abc");
  assert.equal(tenantSourceProfileId("talent_site", ""), null);
  assert.equal(tenantSourceProfileId("app", "abc"), null);
  assert.equal(tenantSourceProfileId(null, "abc"), null);
});

test("IP verify key", () => {
  assert.equal(verifyIpRateKey("1.2.3.4"), "auth-otp-verify-ip:1.2.3.4");
  assert.equal(verifyIpRateKey(""), "auth-otp-verify-ip:unknown");
});

test("claim requires confirmed email; OTP proven bypasses; Apple relay skips", () => {
  assert.equal(isAuthEmailConfirmedForClaim({ email_confirmed_at: "2026-01-01T00:00:00Z" }), true);
  assert.equal(isAuthEmailConfirmedForClaim({ email_confirmed_at: null, identities: [] }), false);
  assert.equal(
    isAuthEmailConfirmedForClaim({
      email_confirmed_at: null,
      identities: [{ provider: "google", identity_data: { email_verified: true } }],
    }),
    true,
  );
  assert.equal(isApplePrivateRelayEmail("a@privaterelay.appleid.com"), true);
  assert.equal(isApplePrivateRelayEmail("a@example.com"), false);
  assert.equal(shouldClaimInquiriesForSignIn({ otpProven: true, email: "x@y.com", emailConfirmed: false }), true);
  assert.equal(shouldClaimInquiriesForSignIn({ email: "x@y.com", emailConfirmed: false }), false);
  assert.equal(shouldClaimInquiriesForSignIn({ email: "x@y.com", emailConfirmed: true }), true);
  assert.equal(
    shouldClaimInquiriesForSignIn({
      email: "h@privaterelay.appleid.com",
      emailConfirmed: true,
    }),
    false,
  );
  assert.equal(userHasGoogleIdentity({ identities: [{ provider: "google" }] }), true);
  assert.equal(userHasGoogleIdentity({ identities: [{ provider: "email" }], app_metadata: {} }), false);
  assert.equal(userHasGoogleIdentity({ identities: [], app_metadata: { provider: "google" } }), true);
});

test("UTC fallback shows the zone label next to the time", () => {
  const base = { upcoming: [{ title: null, eventDate: "2026-10-09T10:00:00Z", status: null, amountCents: null, currencyCode: null, paymentStatus: null }], unread: 0, nowMs: Date.parse("2026-10-07T12:00:00Z"), locale: "en" };
  assert.match(shapeAccountSummary({ ...base, timeZone: "UTC" }).nextVisit!.timeLabel, /10:00.*UTC$/);
  assert.match(shapeAccountSummary({ ...base, timeZone: "Bad/Zone" }).nextVisit!.timeLabel, /UTC$/);
  assert.doesNotMatch(shapeAccountSummary({ ...base, timeZone: "America/Mexico_City" }).nextVisit!.timeLabel, /UTC/);
});
