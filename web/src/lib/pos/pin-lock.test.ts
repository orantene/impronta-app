import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PIN_LOCK_WINDOW_MINUTES, pinLockMinutes, pinLockSentence, pinStatusFor } from "./pin-lock";
import { approveCustomAmount } from "./approval";
import { unlockTill } from "./device-session";

const WEB = join(__dirname, "..", "..", "..");

function rpcAdmin(reply: unknown) {
  return {
    from: () => {
      throw new Error("no table");
    },
    rpc: async () => ({ data: reply, error: null }),
  };
}

function messages(lang: string) {
  return JSON.parse(readFileSync(join(WEB, `messages/${lang}.json`), "utf8")).dashboard.pos.engine.refusal as Record<string, string>;
}

test("TUL-1723: locked is its own state, not the typo sentence, in en and es", () => {
  for (const lang of ["en", "es"]) {
    const refusal = messages(lang);
    const locked = pinStatusFor(refusal, "pin_throttled");
    const typo = pinStatusFor(refusal, "pin_invalid");
    assert.equal(locked.locked, true, lang);
    assert.equal(typo.locked, false, lang);
    assert.notEqual(locked.text, typo.text, lang);
    assert.match(locked.text, new RegExp(`\\b${PIN_LOCK_WINDOW_MINUTES}\\b`), `${lang}: wait time is shown`);
    assert.doesNotMatch(locked.text, /\{minutes\}/, lang);
    assert.equal(typo.text, refusal.pin_invalid, lang);
  }
});

test("TUL-1723: the wait time follows the engine's seconds, capped to the window", () => {
  assert.equal(pinLockMinutes(undefined), PIN_LOCK_WINDOW_MINUTES);
  assert.equal(pinLockMinutes(95), 2);
  assert.equal(pinLockMinutes(1), 1);
  assert.equal(pinLockMinutes(99999), PIN_LOCK_WINDOW_MINUTES);
  assert.equal(pinLockSentence("Try again in {minutes} min.", 61), "Try again in 2 min.");
  assert.match(pinStatusFor(messages("es"), "pin_throttled", 120).text, /\b2\b/);
});

test("TUL-1723: the till unlock and the approval both return pin_throttled for a lockout", async () => {
  const lockout = { ok: false, reason: "pin_invalid", throttled: true };
  const unlock = await unlockTill(rpcAdmin(lockout), { tenantId: "t1", deviceKey: "device-key-aa", userId: "u1", pin: "1234" });
  assert.deepEqual(unlock, { ok: false, reason: "pin_throttled", throttled: true });
  const approve = await approveCustomAmount(rpcAdmin({ ...lockout, retry_after_seconds: 130 }), {
    tenantId: "t1",
    orderId: "o1",
    lineId: "l1",
    operationKey: "approve:l1:abcdefgh",
    approverUserId: "u1",
    pin: "1234",
  });
  assert.deepEqual(approve, { ok: false, reason: "pin_throttled", throttled: true, retryAfterSeconds: 130 });
});

test("TUL-1723: a plain wrong PIN stays pin_invalid", async () => {
  const unlock = await unlockTill(rpcAdmin({ ok: false, reason: "pin_invalid" }), { tenantId: "t1", deviceKey: "device-key-aa", userId: "u1", pin: "1234" });
  assert.deepEqual(unlock, { ok: false, reason: "pin_invalid" });
});

test("TUL-1723: the lock screen and the approval dialog both render the locked state", () => {
  const read = (p: string) => readFileSync(join(WEB, p), "utf8");
  const lock = read("src/app/(workspace)/[tenantSlug]/admin/pos/counter-lock.tsx");
  const engine = read("src/app/(workspace)/[tenantSlug]/admin/pos/counter-engine.tsx");
  assert.match(lock, /pinStatusFor\(copy\.refusal, r\.reason/);
  assert.match(engine, /pinStatusFor\(copy\.refusal, r\.reason/);
  assert.match(lock, /statusLocked=/);
  assert.match(engine, /statusLocked=/);
  assert.match(read("src/components/admin/pos/LockScreen.tsx"), /data-pos-pin-locked/);
  assert.match(read("src/components/admin/pos/CustomAmount.tsx"), /data-pos-pin-locked/);
});
