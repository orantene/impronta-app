import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-1784: client login hung >20 s on "Signing in…". The path had unbounded awaits (password check, then four
 * follow-ups that do not decide whether the password was right). Pins: every remote call is bounded, the password
 * check ends in a visible translated error, the follow-ups are skipped (logged) not awaited forever, and the form
 * says so when it is slow.
 */
const actions = readFileSync(join(process.cwd(), "src/app/auth/actions.ts"), "utf8");
const form = readFileSync(join(process.cwd(), "src/app/(auth)/login/login-form.tsx"), "utf8");
const signIn = actions.slice(actions.indexOf("export async function signInWithEmail("), actions.indexOf("export type SignInModalState"));

test("the password check is bounded and a timeout is a visible, translated error", () => {
  assert.match(signIn, /bounded\("signInWithPassword", supabase\.auth\.signInWithPassword\(\{ email, password \}\), SIGN_IN_PASSWORD_DEADLINE_MS\)/);
  assert.match(signIn, /if \(signedIn === TIMED_OUT\) return \{ error: t\("public\.auth\.errors\.timeout"\) \}/);
});

test("every follow-up on the sign-in path is bounded", () => {
  for (const name of ["claimAndActivateVerifiedClient", "loadAccessProfile", "resetLocaleOnSignIn", "claimGuestSupportOnAuth", "claimTulalaBriefOnAuth"]) {
    assert.match(signIn, new RegExp(`bounded\\(\\s*"${name}"`), `${name} is bounded`);
  }
  assert.doesNotMatch(signIn, /await claimAndActivateVerifiedClient\(/, "no bare await left");
});

test("a use-server file exports only async functions: the deadline constants stay private", () => {
  assert.doesNotMatch(actions, /export const SIGN_IN_/);
  assert.match(actions, /const SIGN_IN_PASSWORD_DEADLINE_MS = 15_000/);
  assert.match(actions, /const SIGN_IN_FOLLOW_UP_DEADLINE_MS = 6_000/);
});

test("a timed-out profile read falls back to the no-profile route, never blocks the redirect", () => {
  assert.match(signIn, /profileRead === TIMED_OUT \? null : profileRead/);
});

test("the form shows a slow-sign-in notice while pending, in both languages", () => {
  assert.match(form, /SLOW_SIGN_IN_MS/);
  assert.match(form, /pending && slow/);
  assert.match(form, /t\("public\.auth\.login\.slow"\)/);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8")) as { public: { auth: { errors: Record<string, string>; login: Record<string, string> } } };
    assert.ok(m.public.auth.errors.timeout, `${l} timeout`);
    assert.ok(m.public.auth.login.slow, `${l} slow`);
  }
});
