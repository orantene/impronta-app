/**
 * TUL-173 — client popover must offer Google + password (not email-code only),
 * keep attach behind verified identity, and never redirect off a talent host.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("popover wires Google popup + password action + code verify", () => {
  const ui = read("src/components/client-account/ClientAccountButton.tsx");
  assert.match(ui, /finalizeClientAccountGoogleSession/);
  assert.match(ui, /signInClientAccountPassword/);
  assert.match(ui, /verifyClientAccountCode/);
  assert.match(ui, /\/auth\/google/);
  assert.match(ui, /popup=1/);
  assert.match(ui, /AUTH_POPUP_MESSAGE_TYPE/);
  assert.match(ui, /event\.origin !== window\.location\.origin/);
  assert.doesNotMatch(ui, /navigateToAuthPopupDestination/);
  assert.match(ui, /usePassword/);
  assert.match(ui, /step === "password"/);
});

test("password and Google actions never redirect; share attach path", () => {
  const actions = read("src/lib/client-account/actions.ts");
  assert.match(actions, /export async function signInClientAccountPassword/);
  assert.match(actions, /export async function finalizeClientAccountGoogleSession/);
  assert.match(actions, /completeClientAccountSignIn/);
  assert.match(actions, /method: "password"/);
  assert.match(actions, /method: "google"/);
  assert.match(actions, /method: "email_code"/);
  assert.doesNotMatch(actions, /from "next\/navigation"/);
  assert.doesNotMatch(actions, /\bredirect\(/);
  assert.match(actions, /isClientAccountEligible/);
  assert.match(actions, /claimInquiriesByConfirmedEmail/);
  assert.match(actions, /ensureTenantClientRelationship/);
});

test("talent hosts passthrough /auth/ for same-origin Google OAuth", () => {
  const routing = read("src/lib/saas/talent-site-host-routing.ts");
  assert.match(routing, /"\/auth\/"/);
  assert.match(routing, /"auth"/);
});
