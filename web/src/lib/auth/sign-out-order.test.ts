import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { isSigningOutHere, markSigningOutHere, shouldReloadOnSignOut, SIGNED_OUT_MESSAGE } from "./cross-tab-sign-out";
import { signOutEverywhere } from "./sign-out-client";

/**
 * S1 (TUL-1036 / TUL-1160), found via CI run 39156017180: after a Log out click the sign-out POST
 * never reached the server and the page ended on /login.
 *  (A) the sender's OWN cross-tab listener got the broadcast and called location.reload(), which
 *      supersedes the form navigation;
 *  (B) the auth cookies were expired BEFORE the POST, so even a delivered POST carried no session
 *      and `signOut({ scope: "global" })` revoked nothing.
 * Pinned here: the order of events and the self-reload guard.
 */
type Ev = string;
const events: Ev[] = [];
const pagehide: Array<() => void> = [];
const g = globalThis as Record<string, unknown>;
const saved = { document: g.document, window: g.window, BroadcastChannel: g.BroadcastChannel };

function installBrowser() {
  events.length = 0;
  pagehide.length = 0;
  const store = () => ({ length: 1, key: () => "sb-x-auth-token", removeItem: () => events.push("storage-clear") });
  const form: Record<string, unknown> = { style: {}, submit: () => events.push("form-submit") };
  g.document = {
    get cookie() {
      return "sb-abc-auth-token=secret; theme=dark";
    },
    set cookie(v: string) {
      events.push(`cookie:${/Max-Age=0/.test(v) ? "expire" : "set"}`);
    },
    createElement: () => form,
    body: { appendChild: () => events.push("form-append") },
  };
  g.window = {
    location: { hostname: "app.tulala.digital" },
    localStorage: store(),
    sessionStorage: store(),
    addEventListener: (t: string, fn: () => void) => {
      if (t === "pagehide") pagehide.push(fn);
    },
  };
  g.BroadcastChannel = class {
    constructor(public name: string) {}
    postMessage() {
      events.push("broadcast");
    }
    close() {}
  };
}
afterEach(() => {
  g.document = saved.document;
  g.window = saved.window;
  g.BroadcastChannel = saved.BroadcastChannel;
});

test("the auth cookies are NOT expired before the sign-out POST leaves (so the server can revoke the session)", () => {
  installBrowser();
  signOutEverywhere();
  const submitAt = events.indexOf("form-submit");
  assert.ok(submitAt > 0, `form was submitted: ${events.join(",")}`);
  assert.deepEqual(events.slice(0, submitAt).filter((e) => e.startsWith("cookie:")), [], "no cookie expiry before the POST");
  assert.ok(events.slice(0, submitAt).includes("storage-clear"), "storage is cleared before the POST (it cannot cancel it)");
});

test("this page's own cookie copies are dropped on pagehide, after the request has left", () => {
  installBrowser();
  signOutEverywhere();
  assert.equal(pagehide.length, 1);
  const before = events.length;
  pagehide[0]!();
  assert.ok(events.slice(before).some((e) => e === "cookie:expire"), "cookies expired on pagehide");
});

test("the document is marked as signing out BEFORE the broadcast, so its own listener ignores it", () => {
  installBrowser();
  const win = g.window as object;
  assert.equal(isSigningOutHere(win), false);
  assert.equal(shouldReloadOnSignOut(SIGNED_OUT_MESSAGE, win), true, "another tab still reloads");
  signOutEverywhere();
  assert.equal(isSigningOutHere(win), true);
  assert.equal(shouldReloadOnSignOut(SIGNED_OUT_MESSAGE, win), false, "the signing-out tab does not reload itself");
  // the mark happens before the broadcast is posted (deliveries are queued tasks, but pin the order)
  assert.ok(events.indexOf("broadcast") >= 0);
});

test("an unrelated message never reloads, and a fresh window is not marked", () => {
  assert.equal(shouldReloadOnSignOut("something-else", {}), false);
  const other = {};
  markSigningOutHere(other);
  assert.equal(isSigningOutHere({}), false);
  assert.equal(isSigningOutHere(other), true);
});

test("static: both listeners use the guard and SignOutForm no longer expires cookies on submit", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  assert.match(read("src/components/auth/CrossTabSignOutListener.tsx"), /shouldReloadOnSignOut\(/);
  assert.match(read("src/components/client-account/AccountClientIslands.tsx"), /shouldReloadOnSignOut\(/);
  const form = read("src/components/auth/SignOutForm.tsx");
  assert.match(form, /prepareBrowserSignOut\(\)/);
  assert.doesNotMatch(form, /clearBrowserAuthState\(\)/);
  const client = read("src/lib/auth/sign-out-client.ts");
  const fn = client.slice(client.indexOf("export function signOutEverywhere"));
  assert.ok(fn.indexOf("markSigningOutHere()") < fn.indexOf("announceSignOut()"), "mark before announce");
  assert.ok(fn.indexOf("prepareBrowserSignOut()") < fn.indexOf("form.submit()"));
  assert.doesNotMatch(fn, /clearBrowserAuthState\(\)|clearBrowserAuthCookies\(\)/, "no cookie expiry in the entry point");
});
