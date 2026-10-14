import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { SIGNED_OUT_KEY, announceSignOut, shouldReloadForSignOut } from "./cross-tab-sign-out";

test("TUL-788: only a sign-out announcement reloads another tab", () => {
  assert.equal(shouldReloadForSignOut({ key: SIGNED_OUT_KEY, newValue: "123" }), true);
  assert.equal(shouldReloadForSignOut({ key: SIGNED_OUT_KEY, newValue: null }), false);
  assert.equal(shouldReloadForSignOut({ key: "other", newValue: "1" }), false);
  assert.equal(shouldReloadForSignOut({ key: null, newValue: null }), false);
  const m = new Map<string, string>();
  announceSignOut({ setItem: (k, v) => void m.set(k, v) }, 42);
  assert.equal(m.get(SIGNED_OUT_KEY), "42");
  announceSignOut({ setItem: () => { throw new Error("blocked"); } }, 1);
  announceSignOut(null, 1);
});

test("every sign-out path announces it, and the root layout listens", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  const helper = read("src/lib/auth/sign-out-client.ts");
  const clear = helper.slice(helper.indexOf("export function clearBrowserAuthState"), helper.indexOf("function safeStorage"));
  assert.match(clear, /announceSignOut\(/);
  assert.match(read("src/app/layout.tsx"), /<CrossTabSignOut \/>/);
  assert.match(read("src/components/auth/cross-tab-sign-out.tsx"), /addEventListener\("storage"/);
});
