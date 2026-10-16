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

test("TUL-854: ES with no talent name never says 'the studio' or 'the team'", () => {
  for (const given of ["", "  ", "the studio", "the team"]) {
    const { subject, html } = buildGuestClaimEmail("l", given, brand, "es");
    assert.equal(subject, "Continúa tu conversación con Tulala");
    assert.doesNotMatch(subject + html, /the studio|the team/i);
  }
  const noBrandName = { ...brand, accountName: "" };
  assert.equal(buildGuestClaimEmail("l", "", noBrandName, "es").subject, "Continúa tu conversación con el equipo");
  assert.equal(buildGuestClaimEmail("l", "", noBrandName, "en").subject, "Continue your conversation with the team");
});

test("TUL-854: the talent display name wins over the workspace name", () => {
  assert.equal(buildGuestClaimEmail("l", "Jorgelina", brand, "es").subject, "Continúa tu conversación con Jorgelina");
});
