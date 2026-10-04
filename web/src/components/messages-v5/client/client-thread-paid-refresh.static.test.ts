/**
 * Revert-proof: `/c/t/[token]` must refresh while a Pay card can still flip.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const HERE = join(process.cwd(), "src/components/messages-v5/client");

test("ClientThread wires useClientThreadPaidRefresh", () => {
  const src = readFileSync(join(HERE, "ClientThread.tsx"), "utf8");
  assert.match(src, /useClientThreadPaidRefresh/);
  assert.match(src, /from "\.\/use-client-thread-paid-refresh"/);
});

test("paid-refresh listens for visibility + pageshow + open payment_request", () => {
  const src = readFileSync(join(HERE, "use-client-thread-paid-refresh.ts"), "utf8");
  assert.match(src, /visibilitychange/);
  assert.match(src, /pageshow/);
  assert.match(src, /clientThreadNeedsPaidRefresh/);
  assert.match(src, /refresh\(\)/);
});
