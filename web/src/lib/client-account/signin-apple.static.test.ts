/**
 * TUL-65 — Apple sign-in wired for /login + client popover; no redirect attach.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("login page mounts Apple next to Google only when provider flag is on", () => {
  const page = read("src/app/(auth)/login/page.tsx");
  assert.match(page, /LoginAppleButton/);
  assert.match(page, /isAppleAuthProviderEnabled/);
  assert.match(page, /isAppleAuthProviderEnabled\(\) \? \(/);
  assert.match(page, /public\.auth\.login\.apple/);
  assert.match(page, /public\.auth\.appleUnableToStart/);
  assert.doesNotMatch(page, /TODO\(P5 mobile readiness/);
});

test("auth/apple route uses Apple provider and refuses when flag off", () => {
  const route = read("src/app/auth/apple/route.ts");
  assert.match(route, /provider:\s*"apple"/);
  assert.match(route, /signInWithOAuth/);
  assert.match(route, /popup/);
  assert.match(route, /isAppleAuthProviderEnabled/);
  const getFn = route.slice(route.indexOf("export async function GET"));
  assert.ok(getFn.indexOf("isAppleAuthProviderEnabled") < getFn.indexOf("signInWithOAuth"));
});

test("popover wires Apple popup + finalize; stays on host; tick-only ageTerms", () => {
  const ui = read("src/components/client-account/ClientAccountButton.tsx");
  assert.match(ui, /finalizeClientAccountAppleSession/);
  assert.match(ui, /finalizeClientAccountGoogleSession/);
  assert.match(ui, /verifyClientAccountCode/);
  assert.match(ui, /\/auth\/apple/);
  assert.match(ui, /popup=1/);
  assert.match(ui, /AUTH_POPUP_MESSAGE_TYPE/);
  assert.match(ui, /event\.origin !== window\.location\.origin/);
  assert.doesNotMatch(ui, /navigateToAuthPopupDestination/);
  assert.match(ui, /appleSignInEnabled/);
  assert.match(ui, /appleSignInEnabled \? \(/);
  assert.match(ui, /requireAgeTermsTick/);
  assert.match(ui, /function startApple\(\) \{\n\s*if \(!requireAgeTermsTick\(\)\) return;/);
  assert.match(ui, /finalizeClientAccountAppleSession\(\{\n\s*locale: loc,\n\s*ageTerms: ageTermsRef\.current === true,/);
  assert.doesNotMatch(ui, /ageTerms:\s*true\s*[,}]/);
  const dock = read("src/components/client-account/ClientAccountDock.tsx");
  const header = read("src/lib/site-admin/sections/site_header/HeaderAccountItem.tsx");
  assert.match(dock, /isAppleAuthProviderEnabled\(\)/);
  assert.match(header, /isAppleAuthProviderEnabled\(\)/);
});

test("Apple finalize shares attach path; guards impersonation; never redirects", () => {
  const actions = read("src/lib/client-account/actions.ts");
  assert.match(actions, /export async function finalizeClientAccountAppleSession/);
  assert.match(actions, /assertNotImpersonating/);
  assert.match(actions, /completeClientAccountSignIn/);
  assert.match(actions, /method: "apple"/);
  assert.match(actions, /method: "email_code"/);
  assert.match(actions, /userHasAppleIdentity/);
  assert.match(actions, /checkAuthAppleFinalizeByUser/);
  assert.match(actions, /isAppleAuthProviderEnabled/);
  assert.match(actions, /isAuthEmailConfirmedForClaim/);
  assert.match(actions, /shouldClaimInquiriesForSignIn/);
  assert.doesNotMatch(actions, /from "next\/navigation"/);
  assert.doesNotMatch(actions, /\bredirect\(/);
  assert.match(actions, /claimInquiriesByConfirmedEmail/);
  assert.match(actions, /ensureTenantClientRelationship/);
  // assertNotImpersonating is the first await in Apple finalize (before getUser / attach).
  const appleFn = actions.slice(actions.indexOf("export async function finalizeClientAccountAppleSession"));
  const afterSig = appleFn.indexOf("): Promise<ClientAccountSignInResult> {");
  assert.ok(afterSig >= 0);
  const body = appleFn.slice(afterSig);
  const assertPos = body.indexOf("assertNotImpersonating");
  const getUserPos = body.indexOf("getUser");
  assert.ok(assertPos >= 0 && assertPos < getUserPos);
  // Match password/Google: host-aware surface gate (not bare clientAccountEnabledFor).
  assert.match(body, /accountSurfaceEnabledForRequest\(\)/);
  assert.doesNotMatch(body, /clientAccountEnabledFor/);
});

test("talent hosts allow-list only /auth/apple|/auth/google|/auth/callback", () => {
  const routing = read("src/lib/saas/talent-site-host-routing.ts");
  assert.match(routing, /"\/auth\/apple"/);
  assert.match(routing, /"\/auth\/google"/);
  assert.match(routing, /"\/auth\/callback"/);
  assert.doesNotMatch(routing, /"\/auth\/"/);
  assert.match(routing, /"auth"/);
});

test("ClientAuthMethod union and appleFailed keys stay aligned", () => {
  const pure = read("src/lib/client-account/pure.ts");
  assert.match(pure, /\["email_code", "google", "password", "sso", "apple"\]/);
  const en = JSON.parse(read("messages/en.json")) as {
    public: { clientAccount: Record<string, string>; auth: { login: Record<string, string> } };
  };
  const es = JSON.parse(read("messages/es.json")) as {
    public: { clientAccount: Record<string, string>; auth: { login: Record<string, string> } };
  };
  assert.equal(typeof en.public.clientAccount.appleFailed, "string");
  assert.equal(typeof es.public.clientAccount.appleFailed, "string");
  assert.equal(typeof en.public.auth.login.apple, "string");
  assert.equal(typeof es.public.auth.login.apple, "string");
});
