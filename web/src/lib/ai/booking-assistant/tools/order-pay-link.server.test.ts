/**
 * TUL-36 slice 5 [MONEY]: the assistant's order + pay-link executor, tested with FAKES only.
 * No Stripe, no database: the pipeline, the link minter and the claim table are injected.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assistantMoneyGate } from "./money-gate.server";
import {
  ASSISTANT_MAX_UNITS,
  assistantAttemptKey,
  bookAndSendPayLink,
  clampAssistantUnits,
  realOrderPayLinkDeps,
  type AssistantOfferingRow,
  type AttemptRecord,
  type OrderPayLinkDeps,
  type OrderPayLinkInput,
} from "./order-pay-link.server";

const ROW: AssistantOfferingRow = {
  id: "off1", tenant_id: "T1", talent_profile_id: "tp1", status: "published", moderation_state: "approved", visibility: "public", duration_minutes: 60,
};
const START = "2026-11-03T15:00:00.000Z";

function input(over: Partial<OrderPayLinkInput> = {}): OrderPayLinkInput {
  return {
    offeringId: "off1", catalogTenantId: "T1", inquiryId: "inq1", units: 1, startsAt: START, guestConfirmed: true,
    contact: { email: "g@example.com", phone: null, displayName: "Guest" }, guestSessionId: null, locale: "en",
    publicOrigin: "https://acme.example.com", ...over,
  };
}

type Spy = {
  purchases: unknown[]; links: unknown[]; claims: string[]; orders: string[]; linkCodes: string[];
  store: Map<string, AttemptRecord>;
};

function fakes(over: Partial<{
  gate: boolean; row: AssistantOfferingRow | null; purchase: unknown; link: unknown; claim: "claimed" | "exists" | "error"; findOk: boolean;
  existing: AttemptRecord | null; linkLookup: unknown;
}> = {}): { deps: OrderPayLinkDeps; spy: Spy } {
  const spy: Spy = { purchases: [], links: [], claims: [], orders: [], linkCodes: [], store: new Map() };
  if (over.existing) spy.store.set("pre", over.existing);
  const deps: OrderPayLinkDeps = {
    gate: () => (over.gate === false ? { ok: false, reason: "flag_off" } : { ok: true, provider: "mock" }),
    loadOffering: async () => ({ ok: true, row: over.row === undefined ? ROW : over.row }),
    purchase: async (i) => {
      spy.purchases.push(i);
      return (over.purchase ?? {
        ok: true, orderId: "ord1", customerId: null, totalCents: 70_000, collectCents: 70_000, currency: "MXN", payInPerson: false,
        allocationIds: [], transactionId: "txn1", bookingId: "b1", inquiryId: null, reservationHoldId: "hold1",
      }) as never;
    },
    createLink: async (i) => {
      spy.links.push(i);
      return (over.link ?? { ok: true, code: "CODE1", url: "https://acme.example.com/pay/CODE1", amountCents: 70_000, expiresAt: "2026-11-03T16:00:00.000Z" }) as never;
    },
    loadLink: async () => (over.linkLookup ?? { ok: true, tenantId: "T1", orderId: "ord1", amountCents: 70_000, status: "open", provider: "mock", expiresAt: "2026-11-03T16:00:00.000Z", inquiryId: "inq1" }) as never,
    attempts: {
      find: async () => (over.findOk === false ? { ok: false } : { ok: true, record: over.existing ?? null }),
      claim: async (_t, key) => {
        spy.claims.push(key);
        return over.claim ?? "claimed";
      },
      setOrder: async (_t, _k, id) => void spy.orders.push(id),
      setLink: async (_t, _k, code) => void spy.linkCodes.push(code),
    },
  };
  return { deps, spy };
}

test("OFF by default: the flag decides, nothing else runs", async () => {
  const { deps, spy } = fakes({ gate: false });
  assert.deepEqual(await bookAndSendPayLink(input(), deps), { ok: false, reason: "money_off" });
  assert.equal(spy.purchases.length + spy.links.length + spy.claims.length, 0);
});

test("the money gate: exact flag, test keys only, mock never on production", () => {
  assert.deepEqual(assistantMoneyGate({}), { ok: false, reason: "flag_off" });
  assert.deepEqual(assistantMoneyGate({ AI_ASSISTANT_PAYLINK_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_x" }), { ok: false, reason: "flag_off" });
  assert.deepEqual(assistantMoneyGate({ AI_ASSISTANT_PAYLINK_ENABLED: "1", STRIPE_SECRET_KEY: "sk_live_x" }), { ok: false, reason: "live_key" });
  assert.deepEqual(assistantMoneyGate({ AI_ASSISTANT_PAYLINK_ENABLED: "1", STRIPE_SECRET_KEY: "rk_live_x" }), { ok: false, reason: "live_key" });
  assert.deepEqual(assistantMoneyGate({ AI_ASSISTANT_PAYLINK_ENABLED: "1", STRIPE_SECRET_KEY: "sk_test_x" }), { ok: true, provider: "stripe_test" });
  assert.deepEqual(assistantMoneyGate({ AI_ASSISTANT_PAYLINK_ENABLED: "1" }), { ok: true, provider: "mock" });
  assert.deepEqual(assistantMoneyGate({ AI_ASSISTANT_PAYLINK_ENABLED: "1", VERCEL_ENV: "production" }), { ok: false, reason: "no_provider" });
});

test("only a guest-confirmed pick with a real start and an https origin proceeds", async () => {
  for (const [over, reason] of [
    [{ guestConfirmed: false }, "not_confirmed"],
    [{ startsAt: "tomorrow" }, "bad_input"],
    [{ publicOrigin: "http://acme.example.com" }, "bad_input"],
    [{ offeringId: "" }, "bad_input"],
    [{ inquiryId: "" }, "bad_input"],
  ] as const) {
    const { deps, spy } = fakes();
    assert.deepEqual(await bookAndSendPayLink(input(over), deps), { ok: false, reason }, JSON.stringify(over));
    assert.equal(spy.purchases.length + spy.links.length + spy.claims.length, 0);
  }
});

test("unknown, other-workspace and unsellable services never reach the pipeline", async () => {
  const cases: Array<[AssistantOfferingRow | null, string, string | null]> = [
    [null, "unknown_service", "T1"],
    [{ ...ROW, tenant_id: "T2" }, "unknown_service", "T1"],
    [{ ...ROW, status: "draft" }, "not_sellable", "T1"],
    [{ ...ROW, moderation_state: "pending" }, "not_sellable", "T1"],
    [{ ...ROW, visibility: "on_request" }, "not_sellable", "T1"],
    [{ ...ROW, visibility: "agency_only" }, "not_sellable", "T1"],
    [{ ...ROW, visibility: null }, "not_sellable", "T1"],
    [{ ...ROW, duration_minutes: null }, "needs_person", "T1"],
    [{ ...ROW, talent_profile_id: null }, "needs_person", "T1"],
  ];
  for (const [row, reason, tenant] of cases) {
    const { deps, spy } = fakes({ row });
    assert.deepEqual(await bookAndSendPayLink(input({ catalogTenantId: tenant }), deps), { ok: false, reason }, JSON.stringify(row));
    assert.equal(spy.purchases.length + spy.links.length, 0);
  }
});

test("happy path: server-priced through the pipeline, one order, one link, amount = the pipeline's collect figure", async () => {
  const { deps, spy } = fakes();
  const r = await bookAndSendPayLink(input({ units: 2 }), deps);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.orderId, "ord1");
  assert.equal(r.url, "https://acme.example.com/pay/CODE1");
  assert.equal(r.already, false);
  assert.match(r.reply, /^Done\. Here is your payment link for .*700/);

  assert.equal(spy.purchases.length, 1);
  const p = spy.purchases[0] as Record<string, unknown>;
  assert.equal(p.tenantId, "T1");
  assert.equal(p.offeringId, "off1");
  assert.equal(p.talentProfileId, "tp1");
  assert.equal(p.quantity, 2);
  assert.equal(p.actorUserId, null);
  assert.equal(p.payInPerson, false);
  assert.equal(p.agencyRouted, true);
  assert.equal(p.sourceChannel, "ai_assistant");
  assert.deepEqual(p.reservation, { startsAt: START, endsAt: "2026-11-03T16:00:00.000Z" });
  assert.ok(!Object.keys(p).some((k) => /amount|price|cents|currency|total/i.test(k)), "no price field is ever passed to the pipeline");

  assert.equal(spy.links.length, 1);
  const l = spy.links[0] as Record<string, unknown>;
  assert.equal(l.amountCents, 70_000, "the pipeline's collectCents, not anything else");
  assert.equal(l.tenantId, "T1");
  assert.equal(l.orderId, "ord1");
  assert.equal(l.inquiryId, "inq1");
  assert.equal(l.actorUserId, null);
  assert.match(String(l.idempotencyKey), /^ai-paylink:ai-order:inq1:off1:/);

  assert.deepEqual(spy.claims, [assistantAttemptKey({ inquiryId: "inq1", offeringId: "off1", startsAt: START, units: 2 })]);
  assert.deepEqual(spy.orders, ["ord1"]);
  assert.deepEqual(spy.linkCodes, ["CODE1"]);
});

test("a direct talent channel (no agency scope) is not agency-routed and uses the offering's own workspace", async () => {
  const { deps, spy } = fakes();
  const r = await bookAndSendPayLink(input({ catalogTenantId: null }), deps);
  assert.equal(r.ok, true);
  const p = spy.purchases[0] as Record<string, unknown>;
  assert.equal(p.tenantId, "T1");
  assert.equal(p.agencyRouted, false);
});

test("idempotent: a retry returns the same open link and creates no second order or link", async () => {
  const existing = { orderId: "ord1", paymentLinkCode: "CODE1" };
  const { deps, spy } = fakes({ existing });
  const r = await bookAndSendPayLink(input(), deps);
  assert.equal(r.ok && r.already, true);
  assert.equal(r.ok && r.url, "https://acme.example.com/pay/CODE1");
  assert.equal(spy.purchases.length + spy.links.length + spy.claims.length, 0);
});

test("a prior attempt that is half done, expired, paid or in another workspace goes to a person", async () => {
  for (const f of [
    fakes({ existing: { orderId: "ord1", paymentLinkCode: null } }),
    fakes({ existing: { orderId: "ord1", paymentLinkCode: "CODE1" }, linkLookup: { ok: false, reason: "expired", tenantId: "T1", orderId: "ord1", inquiryId: null } }),
    fakes({ existing: { orderId: "ord1", paymentLinkCode: "CODE1" }, linkLookup: { ok: true, tenantId: "T1", orderId: "o", amountCents: 1, status: "paid", provider: "mock", expiresAt: "x", inquiryId: null } }),
    fakes({ existing: { orderId: "ord1", paymentLinkCode: "CODE1" }, linkLookup: { ok: true, tenantId: "T2", orderId: "o", amountCents: 1, status: "open", provider: "mock", expiresAt: "x", inquiryId: null } }),
    fakes({ claim: "exists" }),
  ]) {
    assert.deepEqual(await bookAndSendPayLink(input(), f.deps), { ok: false, reason: "in_progress" });
    assert.equal(f.spy.purchases.length + f.spy.links.length, 0);
  }
});

test("fails closed when the claim cannot be read or written (held table missing)", async () => {
  for (const f of [fakes({ findOk: false }), fakes({ claim: "error" })]) {
    assert.deepEqual(await bookAndSendPayLink(input(), f.deps), { ok: false, reason: "unavailable" });
    assert.equal(f.spy.purchases.length + f.spy.links.length, 0);
  }
});

test("pipeline refusals: slot_taken is its own reason, everything else goes to a person; no link is minted", async () => {
  const taken = fakes({ purchase: { ok: false, reason: "slot_taken" } });
  assert.deepEqual(await bookAndSendPayLink(input(), taken.deps), { ok: false, reason: "slot_taken" });
  for (const reason of ["inquiry_only", "request_only", "too_soon", "variant_required", "offering_not_priceable", "account_required", "engine_error"]) {
    const f = fakes({ purchase: { ok: false, reason, error: "x" } });
    assert.deepEqual(await bookAndSendPayLink(input(), f.deps), { ok: false, reason: "needs_person" }, reason);
    assert.equal(f.spy.links.length, 0);
  }
});

test("nothing to collect online (pay in person, no transaction, zero) mints no link", async () => {
  const base = { ok: true, orderId: "ord1", customerId: null, totalCents: 0, collectCents: 0, currency: "MXN", payInPerson: false, allocationIds: [], transactionId: null, bookingId: null, inquiryId: null, reservationHoldId: null };
  for (const purchase of [
    { ...base, payInPerson: true, collectCents: 70_000, transactionId: "t" },
    { ...base, collectCents: 70_000, transactionId: null },
    { ...base, collectCents: 0, transactionId: "t" },
  ]) {
    const f = fakes({ purchase });
    assert.deepEqual(await bookAndSendPayLink(input(), f.deps), { ok: false, reason: "nothing_to_collect" });
    assert.equal(f.spy.links.length, 0);
  }
});

test("a failed link mint is reported and the link code is never recorded", async () => {
  const f = fakes({ link: { ok: false, reason: "provider_unavailable" } });
  assert.deepEqual(await bookAndSendPayLink(input(), f.deps), { ok: false, reason: "link_failed" });
  assert.deepEqual(f.spy.linkCodes, []);
  assert.deepEqual(f.spy.orders, ["ord1"]);
});

test("units are clamped 1..20", async () => {
  assert.equal(clampAssistantUnits(0), 1);
  assert.equal(clampAssistantUnits(99), ASSISTANT_MAX_UNITS);
  assert.equal(clampAssistantUnits(Number.NaN), 1);
  const f = fakes();
  await bookAndSendPayLink(input({ units: 500 }), f.deps);
  assert.equal((f.spy.purchases[0] as Record<string, unknown>).quantity, 20);
});

test("the real claim store maps a unique violation to 'exists' and any other error to 'error'", async () => {
  const calls: Array<{ table: string; row: unknown }> = [];
  const mk = (error: unknown) =>
    ({ from: (table: string) => ({ insert: async (row: unknown) => (calls.push({ table, row }), { error }) }) }) as unknown as SupabaseClient;
  const ok = realOrderPayLinkDeps(mk(null), {});
  assert.equal(await ok.attempts.claim("T1", "ai-order:k"), "claimed");
  assert.deepEqual(calls[0], { table: "ai_assistant_order_attempts", row: { tenant_id: "T1", attempt_key: "ai-order:k" } });
  assert.equal(await realOrderPayLinkDeps(mk({ code: "23505" }), {}).attempts.claim("T1", "k"), "exists");
  assert.equal(await realOrderPayLinkDeps(mk({ code: "42P01" }), {}).attempts.claim("T1", "k"), "error");
  assert.equal(ok.gate().ok, false, "the real gate is OFF with no env flag");
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("static: no model-supplied price, no new Stripe call, no amount parameter, existing pipeline only", () => {
  const src = read("src/lib/ai/booking-assistant/tools/order-pay-link.server.ts");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const inputType = code.slice(code.indexOf("export type OrderPayLinkInput"), code.indexOf("export type OrderPayLinkResult"));
  assert.doesNotMatch(inputType, /amount|price|cents|currency|total/i, "no price field on the executor input");
  assert.doesNotMatch(code, /from "stripe"|stripe\.|createCheckoutSession|payment_intents|checkout\.sessions/i);
  assert.match(code, /placeInstantPurchase/);
  assert.match(code, /createPaymentLink/);
  assert.match(code, /amountCents: purchase\.collectCents/);
  assert.match(code, /isSellable\(row, "guest"\)/);
  assert.match(code, /deps\.gate\(\)\.ok/);
  const gate = read("src/lib/ai/booking-assistant/tools/money-gate.server.ts");
  assert.match(gate, /sk_test_/);
  assert.match(gate, /AI_ASSISTANT_PAYLINK_ENABLED/);
});

test("static: the held migration is additive, RLS-on with no policies, one reserved version, rollback noted", () => {
  const sql = read("../supabase/migrations/_pending_pm/20261231420900_ai_assistant_order_attempts.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ai_assistant_order_attempts/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /CREATE POLICY/i);
  assert.match(sql, /REVOKE ALL ON public\.ai_assistant_order_attempts FROM anon, authenticated/);
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS ai_assistant_order_attempts_tenant_key/);
  assert.match(sql, /Rollback/);
  const body = sql.replace(/--.*$/gm, "").replace(/ON DELETE CASCADE/g, "");
  assert.doesNotMatch(body, /\bDROP\b|\bDELETE\b|\bUPDATE\b|\bTRUNCATE\b|\bALTER TABLE public\.(?!ai_assistant)/i);
});
