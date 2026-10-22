import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { AUTH_ERROR_IDS, authErrorField, firstInvalidSignupField } from "./auth-error-field";

const m = { invalidEmail: "Email invalido", ageTermsRequired: "Acepta los terminos", nameRequired: "Escribe tu nombre" };

test("TUL-1169: each error maps to exactly one field and its own element id", () => {
  assert.equal(authErrorField(undefined, m), null);
  assert.equal(authErrorField("Email invalido", m), "email");
  assert.equal(authErrorField("Acepta los terminos", m), "consent");
  assert.equal(authErrorField("Demasiados intentos", m), "form");
  const ids = new Set(Object.values(AUTH_ERROR_IDS));
  assert.equal(authErrorField("Escribe tu nombre", m), "name");
  assert.equal(ids.size, 4);
});

test("TUL-910: the login card reserves a stable min-height", () => {
  const src = readFileSync(new URL("../../app/(auth)/login/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /LOGIN_CARD_MIN_HEIGHT/);
  const form = readFileSync(new URL("../../components/auth/email-code-form.tsx", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../../components/auth/auth-ui.tsx", import.meta.url), "utf8");
  // email step: the error lives in the hint slot (fixed lines), never as an extra row
  assert.match(form, /hintLines=\{2\}/);
  assert.match(form, /error=\{errField === "email" \|\| errField === "form" \? shownError/);
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

test("TUL-1169: client check names exactly one field, first in visual order", () => {
  const ok = { collectName: true, name: "Ana", email: "a@b.co", consent: "on" };
  assert.equal(firstInvalidSignupField(ok), null);
  // empty name is flagged even when email + consent are fine
  assert.equal(firstInvalidSignupField({ ...ok, name: "  " }), "name");
  // valid email + unticked consent -> consent, never the email
  assert.equal(firstInvalidSignupField({ ...ok, consent: null }), "consent");
  assert.equal(firstInvalidSignupField({ ...ok, email: "nope" }), "email");
  // name, email and consent all bad -> name first
  assert.equal(firstInvalidSignupField({ collectName: true, name: "", email: "x", consent: null }), "name");
  assert.equal(firstInvalidSignupField({ collectName: true, name: "", email: "a@b.co", consent: null }), "name");
  assert.equal(firstInvalidSignupField({ collectName: true, name: "Ana", email: "x", consent: null }), "email");
  // name not asked for -> never flagged
  assert.equal(firstInvalidSignupField({ ...ok, collectName: false, name: "" }), null);
});

test("TUL-1169: each error line sits under its own field (static)", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const form = read("../../components/auth/email-code-form.tsx");
  const box = read("../../components/auth/age-terms-checkbox.tsx");
  // consent text is rendered by the checkbox, not in the email slot
  assert.match(form, /error=\{errField === "consent" \? shownError/);
  assert.match(form, /error=\{errField === "email" \|\| errField === "form" \? shownError/);
  assert.match(form, /error=\{errField === "name" \? shownError/);
  assert.match(box, /<p id=\{errorId\} role="alert"/);
  for (const f of ["actions.ts", "otp-actions.ts"]) {
    assert.match(read(`../../app/auth/${f}`), /public\.auth\.actions\.nameRequired/);
  }
});

test("TUL-1885: a partial date shows an inline error and keeps Confirm disabled", () => {
  const src = readFileSync(
    new URL("../../app/t/[profileCode]/_chat/GuestDetailChipEditorDate.tsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /dateIncomplete = status === "exact" && !eventDate\.trim\(\) && \(badInput \|\| touched\)/);
  assert.match(src, /disabled=\{!canConfirm\}/);
  assert.match(src, /public\.guestChat\.dateIncompleteInline/);
  const msgs = (l: string) =>
    JSON.parse(readFileSync(new URL(`../../../messages/${l}.json`, import.meta.url), "utf8"));
  assert.equal(msgs("es").public.guestChat.dateIncompleteInline, "Completa la fecha");
  assert.equal(msgs("en").public.guestChat.dateIncompleteInline, "Complete the date");
  assert.ok(msgs("es").public.auth.actions.nameRequired && msgs("en").public.auth.actions.nameRequired);
});
