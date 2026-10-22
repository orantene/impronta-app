import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { AUTH_ERROR_IDS, authErrorField } from "./auth-error-field";

const m = { invalidEmail: "Email invalido", ageTermsRequired: "Acepta los terminos" };

test("TUL-1169: each error maps to exactly one field and its own element id", () => {
  assert.equal(authErrorField(undefined, m), null);
  assert.equal(authErrorField("Email invalido", m), "email");
  assert.equal(authErrorField("Acepta los terminos", m), "consent");
  assert.equal(authErrorField("Demasiados intentos", m), "form");
  const ids = new Set(Object.values(AUTH_ERROR_IDS));
  assert.equal(ids.size, 3);
});

test("TUL-910: the login card reserves a stable min-height", () => {
  const src = readFileSync(new URL("../../app/(auth)/login/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /LOGIN_CARD_MIN_HEIGHT/);
  const form = readFileSync(new URL("../../components/auth/email-code-form.tsx", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../../components/auth/auth-ui.tsx", import.meta.url), "utf8");
  // email step: the error lives in the hint slot (fixed lines), never as an extra row
  assert.match(form, /hintLines=\{2\}/);
  assert.match(form, /error=\{stepError\}/);
  assert.match(ui, /min-h-\[2\.175rem\]/);
  // code step: one fixed notice slot, error replaces the sent notice
  assert.match(form, /<div className=\{NOTICE_SLOT_MIN_HEIGHT\}>/);
  assert.match(form, /hintLines=\{3\}/);
});

test("TUL-1885: the guest chat date error is linked from its input", () => {
  const src = readFileSync(
    new URL("../../app/t/[profileCode]/_chat/GuestDetailChipEditorDate.tsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /aria-describedby=\{dateIncomplete \? dateErrorId : undefined\}/);
  assert.match(src, /<p id=\{dateErrorId\} role="alert"/);
});
