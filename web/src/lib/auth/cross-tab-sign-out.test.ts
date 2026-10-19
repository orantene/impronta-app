import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { announceSignOut, hasAuthCookie, SESSION_CHANNEL, SIGNED_OUT_MESSAGE } from "./cross-tab-sign-out";

type Msg = { channel: string; data: unknown };
const bus: Msg[] = [];
let closed = 0;
class FakeChannel {
  constructor(public name: string) {}
  postMessage(data: unknown) { bus.push({ channel: this.name, data }); }
  close() { closed += 1; }
}
const g = globalThis as { BroadcastChannel?: unknown };
const original = g.BroadcastChannel;
afterEach(() => { g.BroadcastChannel = original; bus.length = 0; closed = 0; });

test("TUL-788: announceSignOut broadcasts the signed-out message on the shared session channel, then closes it", () => {
  g.BroadcastChannel = FakeChannel;
  announceSignOut();
  assert.deepEqual(bus, [{ channel: SESSION_CHANNEL, data: SIGNED_OUT_MESSAGE }]);
  assert.equal(closed, 1);
});

test("TUL-788: announceSignOut never throws when BroadcastChannel is missing or broken", () => {
  g.BroadcastChannel = undefined;
  assert.doesNotThrow(() => announceSignOut());
  g.BroadcastChannel = class { constructor() { throw new Error("blocked"); } };
  assert.doesNotThrow(() => announceSignOut());
});

test("TUL-788: only a tab that HAD a session token cookie is reloaded (a login in progress is not a session)", () => {
  assert.equal(hasAuthCookie("sb-abc-auth-token=x; other=1"), true);
  assert.equal(hasAuthCookie("other=1; sb-abc-auth-token.0=x"), true);
  assert.equal(hasAuthCookie(""), false);
  assert.equal(hasAuthCookie("theme=dark; locale=es"), false);
});

test("TUL-788: every mounted listener (root layout and /account shell) shares the sender's channel name and message, and reloads", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  assert.equal(SESSION_CHANNEL, "tulala-session");
  assert.equal(SIGNED_OUT_MESSAGE, "signed-out");
  const root = read("src/components/auth/CrossTabSignOutListener.tsx");
  assert.match(root, /new BroadcastChannel\(SESSION_CHANNEL\)/);
  assert.match(root, /shouldReloadOnSignOut\(event\.data\)[\s\S]{0,40}location\.reload\(\)/);
  const account = read("src/components/client-account/AccountClientIslands.tsx");
  assert.match(account, /const SESSION_CHANNEL = "tulala-session"/);
  assert.match(account, /shouldReloadOnSignOut\(e\.data\)[\s\S]{0,40}location\.reload\(\)/);
  assert.match(read("src/lib/auth/sign-out-client.ts"), /announceSignOut\(\)/);
});
