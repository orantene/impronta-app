/**
 * W5-10 · hub `/c/t` guest thread: accept requires signed-in client; inline
 * email-code claim form, never the dead-end `not_allowed` refusal.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const messagesRoot = join(dir, "../../../../messages");

test("ClientThread gates accept on signed-in client and mounts GuestOfferSignIn", () => {
  const src = read("ClientThread.tsx");
  assert.match(src, /W5-10|TUL-280/);
  assert.match(src, /GuestOfferSignIn/);
  assert.match(src, /signInToAccept/);
  assert.match(src, /requireSignInToAccept/);
  assert.match(src, /\/api\/client\/account/);
  assert.match(src, /if \(clientSignedIn !== true\)/);
  assert.match(src, /setSignInOffer\(offer\)/);
  assert.match(src, /offerAcceptLabel/);
  assert.match(src, /offerSignInPanel/);
  // Unsigned accept must open the form, never call the token writer first.
  assert.match(src, /acceptOfferDirect/);
  // Product UI must not hardcode the not_allowed sentence (catalogue only).
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /You cannot do that from here/);
});

test("ClientThreadView forwards acceptLabel + signInPanel to ClientOfferCard", () => {
  const view = read("ClientThreadView.tsx");
  assert.match(view, /offerAcceptLabel/);
  assert.match(view, /offerSignInOfferId/);
  assert.match(view, /offerSignInPanel/);
  assert.match(view, /acceptLabel=\{p\.offerAcceptLabel\}/);
  assert.match(view, /signInPanel=\{p\.offerSignInOfferId === offer\.id \? p\.offerSignInPanel : null\}/);
});

test("i18n: EN/ES Sign in to accept / Inicia sesión para aceptar", () => {
  const en = readFileSync(join(messagesRoot, "en.json"), "utf8");
  const es = readFileSync(join(messagesRoot, "es.json"), "utf8");
  assert.match(en, /"signInToAccept": "Sign in to accept"/);
  assert.match(es, /"signInToAccept": "Inicia sesión para aceptar"/);
});
