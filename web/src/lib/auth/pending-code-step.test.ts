import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  PENDING_CODE_TTL_MS,
  clearPendingCodeStep,
  readPendingCodeStep,
  savePendingCodeStep,
} from "./pending-code-step";

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const path = "/register?as=client";

test("TUL-766: a sent code step is restored on reload of the same page within 15 minutes", () => {
  const s = mem();
  savePendingCodeStep(s, { email: "a@b.co", name: "Ana", path, now: 1000 });
  assert.deepEqual(readPendingCodeStep(s, { path, now: 1000 + 60_000 }), { email: "a@b.co", name: "Ana" });
});

test("another page, an expired step, garbage or no storage restores nothing", () => {
  const s = mem();
  savePendingCodeStep(s, { email: "a@b.co", path, now: 0 });
  assert.equal(readPendingCodeStep(s, { path: "/login", now: 1 }), null);
  assert.equal(readPendingCodeStep(s, { path, now: PENDING_CODE_TTL_MS + 1 }), null);
  assert.equal(readPendingCodeStep(s, { path, now: 2 }), null, "expired entry was removed");
  s.setItem("tulala.auth.pendingCode", "{not json");
  assert.equal(readPendingCodeStep(s, { path, now: 1 }), null);
  assert.equal(readPendingCodeStep(null, { path, now: 1 }), null);
  savePendingCodeStep(s, { email: "a@b.co", path, now: 0 });
  clearPendingCodeStep(s);
  assert.equal(readPendingCodeStep(s, { path, now: 1 }), null);
});

test("the email-code form saves on send, restores on mount, and clears on 'use a different email'", () => {
  const f = readFileSync(join(process.cwd(), "src/components/auth/email-code-form.tsx"), "utf8");
  assert.match(f, /savePendingCodeStep\(sessionStore\(\)/);
  assert.match(f, /readPendingCodeStep\(sessionStore\(\)/);
  assert.match(f, /: restored\?\.email;/);
  assert.match(f, /clearPendingCodeStep\(sessionStore\(\)\)/);
  assert.doesNotMatch(f, /eslint-disable/);
});
