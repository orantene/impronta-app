/**
 * TUL-280 · guest dock: accept requires signed-in client; inline email-code,
 * never the dead-end `not_allowed` refusal on the offer card.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(dir, name), "utf8");

test("guest offer accept gates on signed-in client and mounts GuestOfferSignIn", () => {
  const cards = read("GuestClientCards.tsx");
  assert.match(cards, /TUL-280/);
  assert.match(cards, /GuestOfferSignIn/);
  assert.match(cards, /signInToAccept/);
  assert.match(cards, /requireSignInToAccept/);
  assert.match(cards, /\/api\/client\/account/);
  assert.match(cards, /verifyClientAccountCode|onSignInComplete/);
  // Unsigned accept must open the form, never call the token-only writer first.
  assert.match(cards, /if \(clientSignedIn !== true\)/);
  assert.match(cards, /setSignInOffer\(offer\)/);
});

test("GuestOfferSignIn uses project-B email-code verify (stays on page)", () => {
  const form = read("GuestOfferSignIn.tsx");
  assert.match(form, /requestEmailCode/);
  assert.match(form, /verifyClientAccountCode/);
  assert.match(form, /data-guest-offer-sign-in/);
  assert.doesNotMatch(form, /sendGuestClaimToEmail|onAddClaimEmail/);
});

test("GuestNextStep mirrors Sign in to accept on the accept CTA", () => {
  const next = read("GuestNextStep.tsx");
  assert.match(next, /requireSignInToAccept/);
  assert.match(next, /signInToAcceptLabel/);
  assert.match(next, /data-guest-next-step-needs-sign-in/);
  assert.match(next, /signInToAcceptHint/);
  // Form stays on the offer card — next-step only opens it.
  assert.doesNotMatch(next, /offerSignInPanel/);
});

test("i18n: EN/ES Sign in to accept / Inicia sesión para aceptar", () => {
  const en = readFileSync(join(dir, "../../../../../messages/en.json"), "utf8");
  const es = readFileSync(join(dir, "../../../../../messages/es.json"), "utf8");
  assert.match(en, /"signInToAccept": "Sign in to accept"/);
  assert.match(es, /"signInToAccept": "Inicia sesión para aceptar"/);
});
