import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { render } from "@react-email/render";
import { createElement } from "react";

import SignupConfirm from "../../../emails/auth/SignupConfirm";
import { platformBrand } from "@/lib/brand/resolve-tenant-brand";
import { buildOtpEmailRedirect } from "@/lib/auth/otp-flow";
import { getEmailCopy, normalizeEmailLocale } from "@/lib/notifications/email-copy";

const url = "https://tulala.digital/auth/confirm?token_hash=abc&type=signup";
const html = async (locale: "en" | "es", code?: string) =>
  render(createElement(SignupConfirm, { confirmUrl: url, code, brand: { ...platformBrand(), locale } }));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

const EN_MARKERS = [/Confirm your email/i, /Thanks for signing up/i, /Expires in/i, /Single use/i];
const ES_MARKERS = [/Confirma tu correo|Confirma tu email/i, /caduca|Expira|vence/i];

test("TUL-814: the ES signup confirmation has a Spanish subject; EN stays English", () => {
  const es = getEmailCopy("es")["auth.signup"];
  const en = getEmailCopy("en")["auth.signup"];
  assert.notEqual(es.subject, en.subject);
  assert.doesNotMatch(es.subject, /Confirm your email/i);
  assert.match(es.subject, /Confirma/i);
  assert.equal(en.subject, "Confirm your email");
});

for (const withCode of [false, true]) {
  test(`TUL-814: ES signup email body is Spanish${withCode ? " (with code)" : ""}, no English copy leaks`, async () => {
    const body = await html("es", withCode ? "20344125" : undefined);
    const copy = getEmailCopy("es")["auth.signup"];
    assert.ok(body.includes(esc(copy.heading)) && body.includes(esc(copy.button)));
    for (const re of ES_MARKERS) assert.match(body, re);
    for (const re of EN_MARKERS) assert.doesNotMatch(body, re);
    assert.doesNotMatch(body, /Confirm email/);
    if (withCode) assert.match(body, /2034\s*4125/);
  });

  test(`TUL-814: EN signup email body is English${withCode ? " (with code)" : ""}`, async () => {
    const body = await html("en", withCode ? "20344125" : undefined);
    assert.match(body, /Confirm your email/);
    assert.doesNotMatch(body, /Confirma tu/i);
  });
}

test("TUL-814: the wizard's language reaches the hook as ?lang= on the redirect, and the hook reads it back", () => {
  for (const lang of ["es", "en"] as const) {
    const redirect = buildOtpEmailRedirect({ origin: "https://tulala.digital", nextPath: "/start", lang });
    assert.equal(normalizeEmailLocale(new URL(redirect).searchParams.get("lang")), lang);
  }
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/onboarding-account.ts"), "utf8");
  assert.match(src, /form\.set\("locale", input\.locale\)/);
});
