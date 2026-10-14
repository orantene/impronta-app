import assert from "node:assert/strict";
import { test } from "node:test";

import { buildGuestClaimEmail } from "./guest-claim-email";

const brand = { wordmark: "TULALA", accountName: "Tulala", footerDomain: "tulala.digital", homeHref: "https://tulala.digital" };

test("English stays English", () => {
  const { subject, html } = buildGuestClaimEmail("https://x.test/c", "Ana", brand, "en");
  assert.equal(subject, "Continue your conversation with Ana");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Pick up the conversation/);
});

test("Spanish guest gets a fully Spanish email, no English leftovers", () => {
  const { subject, html } = buildGuestClaimEmail("https://x.test/c", "Ana", brand, "es-MX");
  assert.match(subject, /Continúa tu conversación con Ana/);
  assert.match(html, /<html lang="es">/);
  assert.match(html, /Retomar la conversación/);
  assert.match(html, /Recibes esto porque/);
  assert.doesNotMatch(html, /Pick up|You received|No password needed/);
  assert.doesNotMatch(html, /\u2014/);
});

test("no locale falls back to English; names are escaped", () => {
  assert.match(buildGuestClaimEmail("l", "<b>", brand).html, /&lt;b&gt;/);
  assert.match(buildGuestClaimEmail("l", "Ana", brand, null).subject, /^Continue/);
});
