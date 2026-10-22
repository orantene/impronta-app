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
  assert.match(src, /const LOGIN_CARD_MIN_HEIGHT = "min-h-\[45\.5rem\] sm:min-h-\[36rem\]"/);
  assert.match(src, /<AuthCard className=\{LOGIN_CARD_MIN_HEIGHT\}>/);
});

test("TUL-1885: the guest chat date error is linked from its input", () => {
  const src = readFileSync(
    new URL("../../app/t/[profileCode]/_chat/GuestDetailChipEditorDate.tsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /aria-describedby=\{dateIncomplete \? dateErrorId : undefined\}/);
  assert.match(src, /<p id=\{dateErrorId\} role="alert"/);
});
