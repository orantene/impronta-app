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

test("age/terms checkbox: tick-only ageTerms, never hard-coded true", () => {
  const ui = read("src/components/client-account/ClientAccountButton.tsx");
  assert.match(ui, /data-testid="client-account-age-terms"/);
  assert.match(ui, /requireAgeTermsTick/);
  assert.match(ui, /ageTerms: ageTerms === true/);
  assert.match(ui, /ageTerms: ageTermsRef\.current === true/);
  assert.match(ui, /public\.auth\.register\.ageTermsPrefix/);
  assert.doesNotMatch(ui, /ageTerms:\s*true/);
  assert.match(ui, /if \(!requireAgeTermsTick\(\)\) return;/);
  assert.match(ui, /fd\.set\("age_terms", "on"\)/);
  assert.doesNotMatch(ui, /ageTerms:\s*true\s*[,}]/);
  assert.match(ui, /finalizeClientAccountAppleSession/);
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
  assert.match(actions, /shouldClaimInquiriesForSignIn/);
  assert.match(actions, /isAuthEmailConfirmedForClaim/);
  assert.match(actions, /checkAuthPasswordByEmail/);
  assert.match(actions, /checkAuthPasswordByIp/);
  assert.match(actions, /checkAuthGoogleFinalizeByUser/);
  assert.match(actions, /userHasGoogleIdentity/);
  assert.match(actions, /genericNotClientError: true/);
  assert.match(actions, /signInGeneric/);
  assert.match(actions, /hasSignupAcceptance/);
  assert.match(actions, /recordSignupAcceptance/);
  assert.match(actions, /input\.ageTerms === true/);
  assert.match(actions, /ageTermsRequired/);
});

test("talent hosts allow-list only /auth/apple|/auth/google|/auth/callback", () => {
  const routing = read("src/lib/saas/talent-site-host-routing.ts");
  assert.match(routing, /"\/auth\/apple"/);
  assert.match(routing, /"\/auth\/google"/);
  assert.match(routing, /"\/auth\/callback"/);
  assert.doesNotMatch(routing, /"\/auth\/"/);
  assert.match(routing, /"auth"/);
});

test("oauth next is normalized; callback uses host-safe destination", () => {
  const google = read("src/app/auth/google/route.ts");
  const callback = read("src/app/auth/callback/route.ts");
  assert.match(google, /normalizeNextPath/);
  assert.match(callback, /normalizeNextPath/);
  assert.match(callback, /hostSafeRedirectDestination/);
});
