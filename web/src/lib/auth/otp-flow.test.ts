/**
 * P4 — guards for the passwordless CLIENT (booker) flow.
 *
 * Four failure classes this locks down:
 *
 * 1. CODE INPUT. People paste "123 456", "123-456" and whole email lines into
 *    the box. Any of those rejected as "that code isn't right" is an abandoned
 *    booking, so normalization is asserted, not assumed.
 *
 * 2. WHO GETS IT. Passwordless-first is CLIENT ONLY in this phase. A regression
 *    that flips operators or talent onto it is a product decision, not a typo,
 *    so it has to break a test.
 *
 * 3. COPY. Every catalog key this flow can render is resolved against BOTH
 *    messages/en.json and messages/es.json — including every error branch,
 *    which is exactly the code path nobody QAs in Spanish.
 *
 * 4. THE EMAILED LINK. `emailRedirectTo` and the auth-email hook's `next`
 *    extraction are the difference between "the link signs you in where you
 *    asked" and the /login?error=auth dead end the hook used to produce.
 */

import assert from "node:assert/strict";
import test from "node:test";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import {
  authEmailLinkNext,
  buildOtpEmailRedirect,
  isCompleteOtpCode,
  isValidAuthEmail,
  normalizeAuthEmail,
  normalizeOtpCode,
  OTP_CODE_MAX_LENGTH,
  OTP_CODE_MIN_LENGTH,
  otpSendErrorKey,
  otpVerifyErrorKey,
  prefersPasswordlessFirst,
} from "./otp-flow";

function lookup(catalog: unknown, key: string): unknown {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function assertCatalogKey(key: string) {
  for (const [locale, catalog] of [
    ["en", en],
    ["es", es],
  ] as const) {
    const value = lookup(catalog, key);
    assert.equal(typeof value, "string", `${locale}.json is missing ${key}`);
    assert.ok((value as string).trim().length > 0, `${locale}.json has an empty ${key}`);
  }
}

/* ─────────────────────────── code normalization ─────────────────────────── */

test("normalizeOtpCode keeps digits and drops everything else", () => {
  assert.equal(normalizeOtpCode("123456"), "123456");
  assert.equal(normalizeOtpCode(" 123 456 "), "123456");
  assert.equal(normalizeOtpCode("123-456"), "123456");
  // Pasting the whole line out of the email.
  assert.equal(normalizeOtpCode("Your code is 123456"), "123456");
  assert.equal(normalizeOtpCode(123456), "123456");
});

test("normalizeOtpCode does NOT truncate a longer emailed code (B2 regression)", () => {
  // The live project is configured with mailer_otp_length = 8. This used to
  // slice to 6, so verifyOtp got "123456" for an emailed "12345678" and the
  // happy path failed every single time with "that code did not work".
  assert.equal(normalizeOtpCode("12345678"), "12345678");
  assert.equal(normalizeOtpCode("1234 5678"), "12345678");
  assert.equal(normalizeOtpCode("Your code is 12345678"), "12345678");
  // Still capped, so pasted garbage never reaches Supabase unbounded.
  assert.equal(normalizeOtpCode("1".repeat(40)).length, OTP_CODE_MAX_LENGTH);
});

test("normalizeOtpCode returns empty for anything unusable", () => {
  for (const bad of [undefined, null, {}, "", "abcdef", true]) {
    assert.equal(normalizeOtpCode(bad), "", `expected "" for ${String(bad)}`);
  }
});

test("isCompleteOtpCode accepts every length Supabase can be configured to send", () => {
  assert.equal(OTP_CODE_MIN_LENGTH, 6);
  assert.equal(OTP_CODE_MAX_LENGTH, 10);
  for (let n = OTP_CODE_MIN_LENGTH; n <= OTP_CODE_MAX_LENGTH; n += 1) {
    assert.equal(isCompleteOtpCode("1".repeat(n)), true, `${n} digits must be accepted`);
  }
  assert.equal(isCompleteOtpCode("12345"), false);
  assert.equal(isCompleteOtpCode("1".repeat(OTP_CODE_MAX_LENGTH + 1)), false);
  assert.equal(isCompleteOtpCode("12345a"), false);
  assert.equal(isCompleteOtpCode(""), false);
});

/* ────────────────────────────── email input ─────────────────────────────── */

test("normalizeAuthEmail trims and lowercases (Supabase stores lowercase)", () => {
  assert.equal(normalizeAuthEmail("  Booker@Studio.COM "), "booker@studio.com");
  assert.equal(normalizeAuthEmail(undefined), "");
  assert.equal(normalizeAuthEmail(["a@b.co", "c@d.co"]), "a@b.co");
});

test("isValidAuthEmail accepts real addresses and rejects the usual near-misses", () => {
  assert.equal(isValidAuthEmail("booker@studio.com"), true);
  assert.equal(isValidAuthEmail("booker+tag@sub.studio.co.uk"), true);
  for (const bad of ["booker", "booker@studio", "booker @studio.com", "@studio.com", ""]) {
    assert.equal(isValidAuthEmail(bad), false, `expected false for "${bad}"`);
  }
});

/* ──────────────────────────── who gets it first ─────────────────────────── */

test("only the client intent is passwordless-first in this phase", () => {
  assert.equal(prefersPasswordlessFirst("client"), true);
  assert.equal(prefersPasswordlessFirst("talent"), false);
  assert.equal(prefersPasswordlessFirst("operator"), false);
  assert.equal(prefersPasswordlessFirst(null), false);
  assert.equal(prefersPasswordlessFirst(undefined), false);
});

/* ───────────────────────────── error mapping ────────────────────────────── */

test("send errors map to actionable copy, not one generic line", () => {
  assert.equal(
    otpSendErrorKey({ code: "over_email_send_rate_limit" }),
    "public.auth.passwordless.errors.tooMany",
  );
  assert.equal(
    otpSendErrorKey({ code: "email_address_invalid" }),
    "public.auth.actions.invalidEmail",
  );
  assert.equal(
    otpSendErrorKey({ code: "email_address_not_authorized" }),
    "public.auth.actions.signupDomainBlocked",
  );
  // otp_disabled is what Supabase returns for shouldCreateUser:false + unknown
  // address. The login action treats it as enumeration-safe; the key still has
  // to be the "signups are off" line for the signup path.
  assert.equal(
    otpSendErrorKey({ code: "otp_disabled" }),
    "public.auth.actions.signupDisabled",
  );
  assert.equal(
    otpSendErrorKey({ message: "Email rate limit exceeded" }),
    "public.auth.passwordless.errors.tooMany",
  );
  assert.equal(otpSendErrorKey({}), "public.auth.passwordless.errors.sendFailed");
  assert.equal(otpSendErrorKey(null), "public.auth.passwordless.errors.sendFailed");
});

test("verify errors distinguish expired from wrong, and both name the fix", () => {
  // Supabase's real wording for BOTH a mistyped and a stale code (verified
  // live). Ambiguous means "check the digits", not "it expired" — the latter
  // sends a booker with a typo to resend instead of to their typo.
  assert.equal(
    otpVerifyErrorKey({ code: "otp_expired", message: "Token has expired or is invalid" }),
    "public.auth.passwordless.errors.codeInvalid",
  );
  assert.equal(
    otpVerifyErrorKey({ code: "otp_expired", message: "Invalid token" }),
    "public.auth.passwordless.errors.codeInvalid",
  );
  // Unambiguously expired keeps the "send a new one" line.
  assert.equal(
    otpVerifyErrorKey({ message: "Otp has expired" }),
    "public.auth.passwordless.errors.codeExpired",
  );
  assert.equal(
    otpVerifyErrorKey({ code: "over_request_rate_limit" }),
    "public.auth.passwordless.errors.tooMany",
  );
  assert.equal(otpVerifyErrorKey({}), "public.auth.passwordless.errors.verifyFailed");
});

/* ───────────── every string the flow can render exists in EN + ES ───────── */

/** Keys `components/auth/email-code-form.tsx` renders. */
const FORM_KEYS = [
  "public.auth.form.email",
  "public.auth.passwordless.emailSubmit",
  "public.auth.passwordless.emailPending",
  "public.auth.passwordless.emailHint",
  "public.auth.passwordless.sentNotice",
  "public.auth.passwordless.resentNotice",
  "public.auth.passwordless.codeLabel",
  "public.auth.passwordless.codeHint",
  "public.auth.passwordless.verifySubmit",
  "public.auth.passwordless.verifyPending",
  "public.auth.passwordless.resend",
  "public.auth.passwordless.resending",
  "public.auth.passwordless.changeEmail",
  "public.auth.passwordless.usePassword",
  "public.auth.passwordless.useCode",
];

/** Keys the two server actions can return. */
const ACTION_KEYS = [
  "public.auth.actions.invalidEmail",
  "public.auth.actions.signupDomainBlocked",
  "public.auth.actions.signupDisabled",
  "public.auth.passwordless.errors.codeRequired",
  "public.auth.passwordless.errors.codeInvalid",
  "public.auth.passwordless.errors.codeExpired",
  "public.auth.passwordless.errors.tooMany",
  "public.auth.passwordless.errors.sendFailed",
  "public.auth.passwordless.errors.verifyFailed",
];

test("every form + action string resolves in both catalogs", () => {
  for (const key of [...FORM_KEYS, ...ACTION_KEYS]) assertCatalogKey(key);
});

test("every key the error mappers can return resolves in both catalogs", () => {
  const errors: unknown[] = [
    { code: "validation_failed" },
    { code: "email_address_invalid" },
    { code: "email_address_not_authorized" },
    { code: "over_email_send_rate_limit" },
    { code: "over_request_rate_limit" },
    { code: "signup_disabled" },
    { code: "otp_disabled" },
    { message: "too many requests" },
    { code: "otp_expired", message: "Token has expired or is invalid" },
    { code: "otp_expired", message: "Invalid token" },
    { code: "invalid_credentials" },
    {},
    null,
    undefined,
  ];
  for (const error of errors) {
    assertCatalogKey(otpSendErrorKey(error));
    assertCatalogKey(otpVerifyErrorKey(error));
  }
});

test("the sent notices keep the {email} placeholder the form substitutes", () => {
  for (const key of [
    "public.auth.passwordless.sentNotice",
    "public.auth.passwordless.resentNotice",
  ]) {
    for (const [locale, catalog] of [
      ["en", en],
      ["es", es],
    ] as const) {
      assert.ok(
        String(lookup(catalog, key)).includes("{email}"),
        `${locale}.json ${key} lost its {email} placeholder`,
      );
    }
  }
});

test("no em dash in the new user-facing copy (house rule)", () => {
  for (const catalog of [en, es]) {
    const block = lookup(catalog, "public.auth.passwordless");
    assert.ok(!JSON.stringify(block).includes("—"), JSON.stringify(block));
  }
});

/* ─────────────────────────── email link plumbing ────────────────────────── */

test("buildOtpEmailRedirect keeps the /auth/callback + next + lang contract", () => {
  const url = new URL(
    buildOtpEmailRedirect({
      origin: "https://app.tulala.digital",
      nextPath: "/client",
      lang: "es",
    }),
  );
  assert.equal(url.origin, "https://app.tulala.digital");
  assert.equal(url.pathname, "/auth/callback");
  assert.equal(url.searchParams.get("next"), "/client");
  assert.equal(url.searchParams.get("lang"), "es");
});

test("buildOtpEmailRedirect never forwards an external or missing next", () => {
  for (const bad of [undefined, null, "", "https://evil.example.com", "evil.com"]) {
    const url = new URL(
      buildOtpEmailRedirect({ origin: "https://app.tulala.digital/", nextPath: bad, lang: "en" }),
    );
    assert.equal(url.searchParams.get("next"), "/", `leaked ${String(bad)}`);
    // Trailing slash on the origin must not produce a double slash.
    assert.equal(url.pathname, "/auth/callback");
  }
});

test("authEmailLinkNext prefers the inner next over the callback pathname", () => {
  // This is the bug: the pathname is /auth/callback for EVERY flow, and
  // /auth/confirm sending you to /auth/callback with no code lands on
  // /login?error=auth.
  assert.equal(
    authEmailLinkNext("https://app.tulala.digital/auth/callback?next=%2Fclient&lang=en"),
    "/client",
  );
  assert.equal(
    authEmailLinkNext(
      "https://app.tulala.digital/auth/callback?next=%2Fupdate-password&lang=es",
    ),
    "/update-password",
  );
  // A deep link with its own query survives whole.
  assert.equal(
    authEmailLinkNext(
      "https://app.tulala.digital/auth/callback?next=%2Fclient%2Finquiries%3Fopen%3D1",
    ),
    "/client/inquiries?open=1",
  );
});

test("authEmailLinkNext refuses protocol-relative and external nexts", () => {
  assert.equal(
    authEmailLinkNext("https://app.tulala.digital/auth/callback?next=//evil.example.com"),
    null,
  );
  assert.equal(
    authEmailLinkNext("https://app.tulala.digital/auth/callback?next=https://evil.example.com"),
    null,
  );
});

test("authEmailLinkNext falls back to a real pathname, and to null for dead ends", () => {
  assert.equal(authEmailLinkNext("https://app.tulala.digital/claim?invitation=x"), "/claim");
  // No usable inner next on an /auth/* target is the dead end described above.
  assert.equal(authEmailLinkNext("https://app.tulala.digital/auth/callback"), null);
  assert.equal(authEmailLinkNext("https://app.tulala.digital/"), null);
  assert.equal(authEmailLinkNext("not a url"), null);
  assert.equal(authEmailLinkNext(undefined), null);
  assert.equal(authEmailLinkNext(null), null);
});
