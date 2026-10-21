import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { confirmConflictHtml, escapeHtml } from "@/lib/auth/confirm-conflict";
import { createTranslator } from "@/i18n/messages";

const route = readFileSync("src/app/auth/confirm/route.ts", "utf8");
const header = readFileSync("src/components/marketing/header.tsx", "utf8");
const button = readFileSync("src/components/client-account/ClientAccountButton.tsx", "utf8");

test("TUL-774: conflict page names the signed-in user, escapes it, and offers both choices (ES)", () => {
  const html = confirmConflictHtml({
    t: createTranslator("es"),
    signedInEmail: `<b>"x"</b>@a.com`,
    continueHref: "https://app.test/auth/confirm?token_hash=a&switch=1",
    stayHref: "https://app.test/",
  });
  assert.match(html, /Cerrar sesión y continuar/);
  assert.match(html, /Mantener la sesión/);
  assert.ok(!html.includes("<b>"), "email must be escaped");
  assert.ok(html.includes(escapeHtml(`<b>"x"</b>@a.com`)));
  assert.ok(!html.includes("public.auth.confirmConflict"), "no raw keys");
});

test("TUL-774: confirm route guards an existing session unless switch=1, and activates client sign-ups", () => {
  assert.match(route, /searchParams\.get\("switch"\) !== "1"/);
  assert.match(route, /confirmConflictHtml/);
  assert.match(route, /signup_as === "client"/);
  assert.match(route, /activateSelfSignedClient/);
});

test("TUL-759: Entrar falls back to the sign-in href when no popover host listens; mobile menu has a client link", () => {
  assert.match(button, /openClientAccountOrNavigate/);
  assert.match(button, /window\.location\.assign\(fallbackHref\)/);
  assert.match(header, /register\?as=client/);
});

test("TUL-910/1191: client signup confirm email copy exists in ES and EN and says client account", async () => {
  const { getEmailCopy } = await import("@/lib/notifications/email-copy");
  assert.match(getEmailCopy("es")["auth.signup"].introClient, /cuenta de cliente/);
  assert.match(getEmailCopy("en")["auth.signup"].introClient, /client account/);
  assert.match(getEmailCopy("es")["auth.signup"].introClientWithCode, /cuenta de cliente/);
});
