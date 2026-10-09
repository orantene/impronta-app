import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import type { RegistrarDomainInfo } from "@/lib/saas/vercel-domains-registrar";
import { fulfillTalentDomainRenewal, recordRenewalConsent, runDomainRenewalSweep, type RenewalSweepDeps } from "./talent-domain-renewal";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** A tiny in-memory Supabase: select / eq / not-is-null / maybeSingle / update, enough for the sweep. */
function fakeDb(tables: Tables): SupabaseClient {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        filters.push((r) => r[col] === v);
        return patch ? Promise.resolve(apply()) : q;
      },
      not: (col: string, _op: string, v: unknown) => {
        filters.push((r) => r[col] !== v);
        return q;
      },
      update: (p: Row) => {
        patch = p;
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
    };
    function apply() {
      for (const r of rows()) Object.assign(r, patch);
      return { error: null };
    }
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const NOW = Date.parse("2026-10-09T12:00:00Z");
const inDays = (d: number) => new Date(NOW + d * 86_400_000 + 3_600_000).toISOString();

function domainRow(over: Row = {}): Row {
  return {
    id: "dom-1",
    domain: "rosa.com",
    talent_profile_id: "tp-1",
    acquisition: "purchased",
    vercel_order_id: "ord-1",
    registrant_email: "rosa@example.com",
    registrar_expires_at: inDays(15),
    registrar_auto_renew: true,
    renewal_price_cents: 1_499,
    renewal_state: "none",
    renewal_cycle_expires_at: null,
    renewal_attempts: 0,
    renewal_last_attempt_at: null,
    renewal_payment_method_id: "pm_consented",
    renewal_consent_at: inDays(-100),
    ...over,
  };
}

function world(domain: Row, withCustomer = true): Tables {
  return {
    talent_site_domains: [domain],
    talent_profiles: [{ id: "tp-1", user_id: "u-1", preferred_locale: "es-MX" }],
    talent_stripe_customers: withCustomer ? [{ user_id: "u-1", stripe_customer_id: "cus_1" }] : [],
  };
}

type Calls = { intents: Row[]; sessions: Row[]; notices: Row[]; autoRenew: Array<[string, boolean]> };

function deps(calls: Calls, opts: { card?: boolean; intentStatus?: string; intentThrows?: boolean; info?: Partial<RegistrarDomainInfo>; turnOffOk?: boolean } = {}): RenewalSweepDeps {
  const stripe = {
    customers: { retrieve: async () => ({ deleted: false, invoice_settings: { default_payment_method: opts.card === false ? null : "pm_1" } }) },
    paymentMethods: { list: async () => ({ data: [] }) },
    paymentIntents: {
      create: async (params: Row) => {
        calls.intents.push(params);
        if (opts.intentThrows) throw new Error("authentication_required");
        return { id: "pi_1", status: opts.intentStatus ?? "succeeded" };
      },
    },
    checkout: {
      sessions: {
        create: async (params: Row) => {
          calls.sessions.push(params);
          return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" };
        },
      },
    },
  } as unknown as Stripe;
  return {
    nowMs: () => NOW,
    registrarConfigured: () => true,
    appBaseUrl: "https://app.test",
    stripe: () => stripe,
    getDomain: async () => ({ attempted: true, ok: true, expiresAt: null, autoRenew: null, renewalPriceCents: null, skippedReason: null, errorCode: null, errorMessage: null, ...opts.info }),
    setAutoRenew: async (domain: string, on: boolean) => {
      calls.autoRenew.push([domain, on]);
      return { attempted: true, ok: opts.turnOffOk !== false, skippedReason: null, errorCode: null, errorMessage: null };
    },
    notify: async (n) => {
      calls.notices.push(n as unknown as Row);
    },
  };
}
const newCalls = (): Calls => ({ intents: [], sessions: [], notices: [], autoRenew: [] });

test("ships dark: with no registrar token the sweep touches nothing", async () => {
  const tables = world(domainRow());
  const report = await runDomainRenewalSweep(fakeDb(tables), { registrarConfigured: () => false });
  assert.equal(report.skipped, "registrar_not_configured");
  assert.equal(report.scanned, 0);
});

test("inside the window a saved card is charged off-session at the renewal price, once per cycle, and the talent is told in her language", async () => {
  const tables = world(domainRow());
  const calls = newCalls();
  const report = await runDomainRenewalSweep(fakeDb(tables), deps(calls));
  assert.equal(report.charged, 1);
  assert.equal(calls.intents.length, 1);
  assert.equal(calls.intents[0].amount, 1_499);
  assert.equal(calls.intents[0].currency, "usd");
  assert.equal(calls.intents[0].off_session, true);
  assert.equal(calls.sessions.length, 0, "no pay link when the card worked");
  assert.equal(tables.talent_site_domains[0].renewal_state, "paid");
  assert.equal(calls.notices.length, 1);
  assert.match(String(calls.notices[0].title), /Renovación de dominio pagada/);
  assert.match(String(calls.notices[0].body), /\$14\.99 USD/);
  // the next sweep in the same cycle does nothing
  const again = await runDomainRenewalSweep(fakeDb(tables), deps(newCalls()));
  assert.equal(again.charged + again.linksSent + again.reminded + again.autoRenewOff, 0);
});

test("the off-session charge uses ONLY the method she consented to at purchase, never another saved card", async () => {
  const tables = world(domainRow());
  const calls = newCalls();
  await runDomainRenewalSweep(fakeDb(tables), deps(calls));
  assert.equal(calls.intents[0].payment_method, "pm_consented");
});

test("no stored consent means a pay link only, even when the customer has other cards", async () => {
  for (const over of [{ renewal_consent_at: null }, { renewal_payment_method_id: null }, { renewal_consent_at: null, renewal_payment_method_id: null }]) {
    const tables = world(domainRow(over));
    const calls = newCalls();
    const report = await runDomainRenewalSweep(fakeDb(tables), deps(calls));
    assert.equal(calls.intents.length, 0, JSON.stringify(over));
    assert.equal(report.charged, 0);
    assert.equal(report.linksSent, 1);
    assert.equal(tables.talent_site_domains[0].renewal_state, "awaiting_payment");
  }
});

test("purchase consent: the card she paid with is stored as the renewal method only when the checkout disclosed the terms", async () => {
  const stripe = { paymentIntents: { retrieve: async () => ({ payment_method: "pm_paid_with" }) } } as unknown as Stripe;
  const given = world(domainRow({ renewal_payment_method_id: null, renewal_consent_at: null }));
  await recordRenewalConsent(fakeDb(given), { talentProfileId: "tp-1", domain: "rosa.com", paymentIntentId: "pi_buy", consentGiven: true }, { stripe: () => stripe });
  assert.equal(given.talent_site_domains[0].renewal_payment_method_id, "pm_paid_with");
  assert.ok(given.talent_site_domains[0].renewal_consent_at);
  const none = world(domainRow({ renewal_payment_method_id: null, renewal_consent_at: null }));
  await recordRenewalConsent(fakeDb(none), { talentProfileId: "tp-1", domain: "rosa.com", paymentIntentId: "pi_buy", consentGiven: false }, { stripe: () => stripe });
  assert.equal(none.talent_site_domains[0].renewal_payment_method_id, null);
});

test("no saved card, or a bank that wants the cardholder: a Checkout link goes out and the cycle waits", async () => {
  for (const o of [{ intentThrows: true }, { intentStatus: "requires_action" }]) {
    const tables = world(domainRow());
    const calls = newCalls();
    const report = await runDomainRenewalSweep(fakeDb(tables), deps(calls, o));
    assert.equal(report.linksSent, 1, JSON.stringify(o));
    assert.equal(calls.sessions.length, 1);
    const s = calls.sessions[0] as { metadata: Record<string, string>; line_items: Array<{ price_data: { unit_amount: number } }> };
    assert.equal(s.metadata.checkout_type, "talent_domain_renewal");
    assert.equal(s.metadata.domain_row_id, "dom-1");
    assert.equal(s.line_items[0].price_data.unit_amount, 1_499);
    assert.equal(tables.talent_site_domains[0].renewal_state, "awaiting_payment");
    assert.equal(tables.talent_site_domains[0].renewal_attempts, 1);
    assert.match(String(calls.notices[0].title), /Paga para conservar rosa\.com/);
    assert.deepEqual((calls.notices[0].targetPayload as { payUrl: string }).payUrl, "https://checkout.stripe.test/cs_1");
  }
});

test("past the deadline and unpaid: auto-renew is turned OFF at the registrar and the talent is told", async () => {
  const tables = world(domainRow({ registrar_expires_at: inDays(3), renewal_state: "awaiting_payment", renewal_cycle_expires_at: inDays(3), renewal_attempts: 1 }));
  const calls = newCalls();
  const report = await runDomainRenewalSweep(fakeDb(tables), deps(calls));
  assert.equal(report.autoRenewOff, 1);
  assert.deepEqual(calls.autoRenew, [["rosa.com", false]]);
  assert.equal(tables.talent_site_domains[0].renewal_state, "unpaid_autorenew_off");
  assert.equal(tables.talent_site_domains[0].registrar_auto_renew, false);
  assert.match(String(calls.notices[0].title), /Renovación automática apagada/);
  assert.equal(calls.intents.length + calls.sessions.length, 0, "never charges after the deadline");
});

test("if the registrar refuses to turn auto-renew off it is reported and retried, never marked done", async () => {
  const tables = world(domainRow({ registrar_expires_at: inDays(3) }));
  const calls = newCalls();
  const report = await runDomainRenewalSweep(fakeDb(tables), deps(calls, { turnOffOk: false }));
  assert.equal(report.failed, 1);
  assert.equal(tables.talent_site_domains[0].renewal_state, "none");
  assert.equal(calls.notices.length, 0);
});

test("an unknown renewal price parks the domain for ops; nothing is billed from a guess", async () => {
  const tables = world(domainRow({ renewal_price_cents: null }));
  const calls = newCalls();
  const report = await runDomainRenewalSweep(fakeDb(tables), deps(calls));
  assert.equal(report.needsAttention, 1);
  assert.equal(calls.intents.length + calls.sessions.length, 0);
  assert.equal(tables.talent_site_domains[0].renewal_state, "needs_attention");
});

test("the sweep refreshes the shared expiry column from the registrar", async () => {
  const tables = world(domainRow({ registrar_expires_at: null }));
  const calls = newCalls();
  await runDomainRenewalSweep(fakeDb(tables), deps(calls, { info: { expiresAt: inDays(300), autoRenew: true, renewalPriceCents: 1_599 } }));
  assert.equal(tables.talent_site_domains[0].registrar_expires_at, inDays(300));
  assert.equal(tables.talent_site_domains[0].renewal_price_cents, 1_599);
  assert.equal(calls.intents.length, 0, "far from expiry: no charge");
});

test("a paid Checkout settles the cycle; a late payment turns auto-renew back on; a wrong amount is parked, not trusted", async () => {
  const calls = newCalls();
  const late = world(domainRow({ registrar_expires_at: inDays(3), renewal_state: "unpaid_autorenew_off", renewal_cycle_expires_at: inDays(3), registrar_auto_renew: false }));
  const r = await fulfillTalentDomainRenewal(fakeDb(late), { sessionId: "cs_1", domainRowId: "dom-1", amountTotal: 1_499, currency: "usd", paymentIntentId: "pi_9" }, deps(calls));
  assert.deepEqual(r, { ok: true });
  assert.equal(late.talent_site_domains[0].renewal_state, "paid");
  assert.deepEqual(calls.autoRenew, [["rosa.com", true]]);
  assert.equal(late.talent_site_domains[0].registrar_auto_renew, true);

  const dup = await fulfillTalentDomainRenewal(fakeDb(late), { sessionId: "cs_1", domainRowId: "dom-1", amountTotal: 1_499, currency: "usd", paymentIntentId: "pi_9" }, deps(calls));
  assert.deepEqual(dup, { ok: true });
  assert.equal(calls.autoRenew.length, 1, "a redelivered event does nothing twice");

  const wrong = world(domainRow({ renewal_state: "awaiting_payment", renewal_cycle_expires_at: inDays(15) }));
  await fulfillTalentDomainRenewal(fakeDb(wrong), { sessionId: "cs_2", domainRowId: "dom-1", amountTotal: 999, currency: "usd", paymentIntentId: "pi_10" }, deps(newCalls()));
  assert.equal(wrong.talent_site_domains[0].renewal_state, "needs_attention");

  const gone = await fulfillTalentDomainRenewal(fakeDb({ talent_site_domains: [] }), { sessionId: "cs_3", domainRowId: "nope", amountTotal: 1, currency: "usd", paymentIntentId: null });
  assert.deepEqual(gone, { ok: true });
});
