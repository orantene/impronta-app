import assert from "node:assert/strict";
import test from "node:test";

import { pickClientIp } from "./client-ip";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

test("first forwarded hop wins", () => {
  assert.equal(pickClientIp(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
});

test("falls back to x-real-ip then x-vercel-forwarded-for", () => {
  assert.equal(pickClientIp(h({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assert.equal(pickClientIp(h({ "x-vercel-forwarded-for": "9.9.9.9" })), "9.9.9.9");
});

test("no header never shares one bucket: each unknown caller gets its own key", () => {
  const a = pickClientIp(h({}));
  const b = pickClientIp(h({}));
  assert.notEqual(a, b);
  assert.ok(a.startsWith("unknown:"));
});
