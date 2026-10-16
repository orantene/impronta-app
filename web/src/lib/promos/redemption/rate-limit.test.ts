import test from "node:test";
import assert from "node:assert/strict";

import { checkCodeAttempt, memoryCodeAttemptLimiters, type CodeAttemptLimiters } from "./rate-limit";

function clock(start: number) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const who = { sessionId: "s1", ip: "1.2.3.4", phoneE164: "+529981234567" };

test("5 code attempts per minute per session+IP, the 6th is refused", async () => {
  const c = clock(1_000_000);
  const l = memoryCodeAttemptLimiters(c.now);
  for (let i = 0; i < 5; i++) assert.equal((await checkCodeAttempt(l, { ...who, phoneE164: null }, c.now)).ok, true);
  const sixth = await checkCodeAttempt(l, { ...who, phoneE164: null }, c.now);
  assert.equal(sixth.ok, false);
  // A different IP on the same session is its own bucket.
  assert.equal((await checkCodeAttempt(l, { ...who, ip: "5.6.7.8", phoneE164: null }, c.now)).ok, true);
  c.advance(60_001);
  assert.equal((await checkCodeAttempt(l, { ...who, phoneE164: null }, c.now)).ok, true);
});

test("20 attempts per day per phone, across sessions", async () => {
  const c = clock(1_000_000);
  const l = memoryCodeAttemptLimiters(c.now);
  for (let i = 0; i < 20; i++) {
    // Fresh session each time so only the phone window can bite.
    assert.equal((await checkCodeAttempt(l, { ...who, sessionId: `s${i}` }, c.now)).ok, true);
  }
  assert.equal((await checkCodeAttempt(l, { ...who, sessionId: "s-new" }, c.now)).ok, false);
  c.advance(24 * 3_600_000 + 1);
  assert.equal((await checkCodeAttempt(l, { ...who, sessionId: "s-new2" }, c.now)).ok, true);
});

test("a limiter outage fails open (the DB lock still guards limits)", async () => {
  const broken: CodeAttemptLimiters = {
    perMinute: { limit: async () => Promise.reject(new Error("kv down")) },
    perPhoneDay: { limit: async () => ({ success: true, reset: 0 }) },
  };
  assert.deepEqual(await checkCodeAttempt(broken, who), { ok: true });
});
