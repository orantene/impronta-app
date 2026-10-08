import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { decideOrderResume, decideTokenResume } from "./guest-order-resume";
import { signThreadToken, verifyThreadToken } from "../messaging/thread-token";

const OID = "33330031-0000-4000-8000-0000000000b1";
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function withSecret<T>(fn: () => T): T {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-tul-11b";
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.GUEST_COOKIE_SECRET;
    else process.env.GUEST_COOKIE_SECRET = prev;
  }
}

/** Mirrors the action: verify, then run the pure gate against the host + order. */
function resume(token: string, host: string | null, orderId: string | null, orderInquiry: string | null, now = NOW) {
  const v = verifyThreadToken(token, now);
  if (!v.ok) return "fallback";
  return decideTokenResume({
    tokenInquiryId: v.inquiryId,
    tokenTenantId: v.tenantId,
    hostTenantId: host,
    orderId,
    orderInquiryId: orderInquiry,
  });
}

test("valid token opens the thread in a fresh session (token only, and with its own order)", () =>
  withSecret(() => {
    const token = signThreadToken("inq-1", "ten-1", NOW)!;
    assert.equal(resume(token, "ten-1", null, null), "redirect");
    assert.equal(resume(token, "ten-1", OID, "inq-1"), "redirect");
  }));

test("tampered token falls back", () =>
  withSecret(() => {
    const token = signThreadToken("inq-1", "ten-1", NOW)!;
    const [v, enc, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "pos-thread", iq: "inq-2", tenant: "ten-1", iat: NOW }), "utf8").toString("base64url");
    assert.equal(resume(`${v}.${forged}.${sig}`, "ten-1", null, null), "fallback");
    assert.equal(resume(`${v}.${enc}.${sig.slice(0, -2)}xx`, "ten-1", null, null), "fallback");
    assert.equal(resume("garbage", "ten-1", null, null), "fallback");
  }));

test("expired token falls back", () =>
  withSecret(() => {
    const token = signThreadToken("inq-1", "ten-1", NOW, NOW + DAY)!;
    assert.equal(resume(token, "ten-1", null, null, NOW + 2 * DAY), "fallback");
  }));

test("token for another tenant or another thread's order falls back", () =>
  withSecret(() => {
    const token = signThreadToken("inq-1", "ten-1", NOW)!;
    assert.equal(resume(token, "ten-2", null, null), "fallback");
    assert.equal(resume(token, null, null, null), "fallback");
    assert.equal(resume(token, "ten-1", OID, "inq-other"), "fallback");
    assert.equal(resume(token, "ten-1", OID, null), "fallback");
  }));

test("unsigned ?order= is unchanged: owner session only", () => {
  assert.equal(decideOrderResume({ parsedOrderId: OID, guestSessionId: "s1", inquiryId: "i1", inquiryGuestSessionId: "s1" }), "open");
  assert.equal(decideOrderResume({ parsedOrderId: OID, guestSessionId: null, inquiryId: "i1", inquiryGuestSessionId: "s1" }), "fallback");
  assert.equal(decideOrderResume({ parsedOrderId: OID, guestSessionId: "s2", inquiryId: "i1", inquiryGuestSessionId: "s1" }), "fallback");
});

test("wiring: page verifies via the action; the order-only path never reads the token", () => {
  const page = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx"), "utf8");
  assert.match(page, /resolveGuestTokenResumeHref/);
  assert.match(page, /if \(href\) redirect\(href\)/);
  const actions = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/_actions/guest-order-resume-actions.ts"), "utf8");
  assert.match(actions, /verifyThreadToken\(token\)/);
  const orderFn = actions.slice(actions.indexOf("export async function getGuestInquiryByOrder"));
  assert.doesNotMatch(orderFn, /verifyThreadToken|decideTokenResume/);
});
