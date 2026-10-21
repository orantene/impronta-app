/** TUL-1700: automatic rent fails closed, retries what it must, and never touches a link row. Behavioural (fakes). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type Stripe from "stripe";
import { applyRentSubscriptionEvent, type RentAutopayApplyDeps } from "./rent-autopay-apply";
import { isRentPaymentSucceeded } from "./rent-autopay-routing";
import { RENT_COPY, rentRefusalText } from "./rent-copy";
import { decideMarkPaidOutside } from "./rent-outside";
import { handleRentChargeEvent, handleRentDraft, handleRentSubscriptionEvent, isPermanentStripeError, listRentReversalsToReconcile, syncRentAutopayWithPlan } from "./rent-autopay.server";
import type { RentPlan } from "./rent-cycle";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const DEC1 = Date.UTC(2026, 11, 1) / 1000;

function adminReturning(result: { data?: unknown; error?: unknown }, onUpdate?: (v: unknown) => void) {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q,
    update: (v: unknown) => { onUpdate?.(v); return q; },
    maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res),
  });
  return { from: () => q } as never;
}

function deps(over: Partial<RentAutopayApplyDeps> & { plan?: Awaited<ReturnType<RentAutopayApplyDeps["loadPlan"]>>; invoice?: Awaited<ReturnType<RentAutopayApplyDeps["loadInvoice"]>> }) {
  const calls: string[] = [];
  const d: RentAutopayApplyDeps = {
    loadPlan: async () => over.plan === undefined ? { status: "active", autopayStatus: "active", subscriptionId: "sub_1", talentProfileId: "tp" } : over.plan,
    setAutopay: async () => true,
    loadInvoice: async () => over.invoice ?? null,
    writeInvoice: async () => { calls.push("write"); return true; },
    voidIssuedLink: async () => "cancelled",
    cancelSubscription: async () => { calls.push("cancel"); return true; },
    notify: async () => {},
    alert: (m) => { calls.push(`alert:${m.slice(0, 20)}`); },
    ...over,
  };
  return { d, calls };
}
const paid = (sub = "sub_1") => ({ type: "paid", planId: "p", tenantId: "t", subscriptionId: sub, invoiceId: "in_1", periodStart: DEC1, amountPaid: 100, currency: "mxn", rentCents: 100 }) as never;

describe("1-2, 5: reads that fail never look like 'nothing there'", () => {
  test("sync: a plan read error refuses (the plan must not change while a card may still be charged)", async () => {
    assert.deepEqual(await syncRentAutopayWithPlan(adminReturning({ error: { message: "x" } }), { tenantId: "t", planId: "p", planStatus: "ended" }), { ok: false });
  });
  test("webhook: a DB error loading the plan is 'unavailable' (Stripe retries), not plan_not_found", async () => {
    const q: Record<string, unknown> = {};
    Object.assign(q, { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: { message: "db down" } }) });
    assert.equal(await handleRentSubscriptionEvent({ from: () => q } as never, paid(), "us"), "unavailable");
  });
  test("handleRentDraft: an unreadable plan retries instead of billing a possibly-skipped month", async () => {
    const ev = { type: "draft", planId: "p", tenantId: "t", subscriptionId: "sub_1", invoiceId: "in_1", customerId: "c", periodStart: DEC1, currency: "mxn", percentAdded: false, feeBps: 150 } as never;
    assert.equal(await handleRentDraft(adminReturning({ error: { message: "x" } }), {} as never, ev), "retry");
  });
});

describe("3: stray and unlinked subscriptions", () => {
  test("a stray second subscription whose cancel fails is retried, not acked", async () => {
    const { d } = deps({ cancelSubscription: async () => false });
    assert.equal(await applyRentSubscriptionEvent({ type: "started", planId: "p", tenantId: "t", subscriptionId: "sub_2", customerId: null } as never, d), "unavailable");
  });
  test("a PAID invoice from an unlinked subscription: alert, cancel it, retry until the cancel works", async () => {
    const ok = deps({});
    assert.equal(await applyRentSubscriptionEvent(paid("sub_other"), ok.d), "ignored_other_subscription");
    assert.ok(ok.calls.some((c) => c.startsWith("alert")) && ok.calls.includes("cancel"));
    assert.equal(await applyRentSubscriptionEvent(paid("sub_other"), deps({ cancelSubscription: async () => false }).d), "unavailable");
  });
  test("paid before the plan is linked is retried (the started event may not be applied yet)", async () => {
    const x = deps({ plan: { status: "active", autopayStatus: "pending", subscriptionId: null, talentProfileId: "tp" } });
    assert.equal(await applyRentSubscriptionEvent(paid(), x.d), "unavailable");
    assert.ok(x.calls.some((c) => c.startsWith("alert")));
  });
});

describe("7: a link or outside row is never overwritten", () => {
  // (TUL-1719: an ISSUED, UNPAID link row is the one exception: it is voided and replaced; see rent-link-void.test.ts.)
  for (const [source, status] of [["link", "paid"], ["link", "failed"], ["outside", "paid"]] as const) {
    test(`an automatic payment on a month that has a ${source} row (${status}) alerts and writes nothing`, async () => {
      const x = deps({ invoice: { status, stripeInvoiceId: null, source } });
      assert.equal(await applyRentSubscriptionEvent(paid(), x.d), "double_payment_alert");
      assert.ok(!x.calls.includes("write"));
    });
  }
  test("a failed automatic charge never overwrites a link row", async () => {
    const x = deps({ invoice: { status: "issued", stripeInvoiceId: null, source: "link" } });
    assert.equal(await applyRentSubscriptionEvent({ type: "failed", planId: "p", tenantId: "t", subscriptionId: "sub_1", invoiceId: "in_1", periodStart: DEC1, attempt: 1, currency: "mxn", rentCents: 100 } as never, x.d), "duplicate");
    assert.ok(!x.calls.includes("write"));
  });
  test("an automatic row of its own is still updated normally", async () => {
    const x = deps({});
    assert.equal(await applyRentSubscriptionEvent(paid(), x.d), "paid_recorded");
    assert.ok(x.calls.includes("write"));
  });
});

describe("4: the pending write is checked", () => {
  test("startRentAutopay refuses when the pending/first-period write fails", () => {
    const src = read("src/lib/service-hub/rent/rent-autopay-actions.ts");
    assert.match(src, /const \{ error: pendErr \} = await admin/);
    assert.match(src, /if \(pendErr\) \{[\s\S]*?reason: "unavailable"/);
    assert.ok(src.indexOf("pendErr") < src.indexOf("return { ok: true, url: session.url }"));
  });
});

describe("6: a future month paid outside on live autopay", () => {
  const plan = (o: Partial<RentPlan> = {}) => ({ id: "p", startsOn: "2026-09-01", status: "active", acceptedAt: "x", autopayStatus: "active", autopayFirstPeriod: "2026-11", ...o }) as RentPlan;
  const ctx = (o: Record<string, unknown> = {}) => ({ plan: plan(), period: "2026-11", method: "cash" as const, amountCents: 100, existingStatus: null, now: new Date("2026-10-15T12:00:00Z"), ...o });
  test("refused unless invoice.created is subscribed; this month and autopay-off plans unaffected", () => {
    assert.deepEqual(decideMarkPaidOutside(ctx()), { ok: false, reason: "autopay_future_month" });
    assert.deepEqual(decideMarkPaidOutside(ctx({ invoiceCreatedSubscribed: true })), { ok: true });
    assert.deepEqual(decideMarkPaidOutside(ctx({ period: "2026-10" })), { ok: true });
    assert.deepEqual(decideMarkPaidOutside(ctx({ plan: plan({ autopayStatus: "off" }) })), { ok: true });
  });
  test("the webhook script subscribes the rent events and has an MX endpoint mode", () => {
    const sh = read("../scripts/ops/configure-stripe-webhook.sh");
    for (const e of ["invoice.created", "invoice.paid", "invoice.payment_failed", "checkout.session.expired"]) assert.match(sh, new RegExp(`^\\s+${e.replace(".", "\\.")}$`, "m"));
    assert.match(sh, /api\/webhooks\/stripe-mx/);
  });
  test("the refusal has copy in both languages", () => {
    assert.ok(rentRefusalText("autopay_future_month", RENT_COPY.en).includes("next month"));
    assert.ok(rentRefusalText("autopay_future_month", RENT_COPY.es).includes("próximo mes"));
  });
});

describe("8: invoice.payment_succeeded of a rent subscription is rent", () => {
  const ev = (type: string, md: Record<string, string> | null) => ({ type, data: { object: { id: "in_1", parent: { subscription_details: { subscription: "sub_1", metadata: md } } } } }) as unknown as Stripe.Event;
  test("only a rent subscription's invoice is claimed; a Plans invoice goes on", () => {
    const rentMd = { checkout_type: "rent_subscription", rent_plan_id: "p", tenant_id: "t", rent_cents: "100" };
    assert.equal(isRentPaymentSucceeded(ev("invoice.payment_succeeded", rentMd)), true);
    assert.equal(isRentPaymentSucceeded(ev("invoice.payment_succeeded", { plan: "pro" })), false);
    assert.equal(isRentPaymentSucceeded(ev("invoice.paid", rentMd)), false);
    assert.match(read("src/lib/stripe/webhook-handler.ts"), /if \(isRentPaymentSucceeded\(event\)\) return;/);
  });
});

describe("9: a rent refund the bank-side cannot reverse is marked, not retried for 3 days", () => {
  const prev = process.env.RENT_AUTOPAY_ENABLED;
  beforeEach(() => { process.env.RENT_AUTOPAY_ENABLED = "1"; });
  afterEach(() => { if (prev === undefined) delete process.env.RENT_AUTOPAY_ENABLED; else process.env.RENT_AUTOPAY_ENABLED = prev; });
  const refund = { type: "charge.refunded", id: "evt_1", data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 1000, amount_refunded: 1000, transfer: "tr_1" } } } as unknown as Stripe.Event;
  const row = { id: "row-1", tenant_id: "t", plan_id: "p", period: "2026-11", talent_profile_id: "tp" };
  const stripeWith = (err: unknown) => ({
    invoicePayments: { list: async () => ({ data: [{ invoice: "in_1" }] }) },
    transfers: { retrieve: async () => ({ amount: 990, amount_reversed: 0 }), createReversal: async () => { throw err; } },
  }) as never;
  test("permanent Stripe refusal: needs_manual and the row is marked", async () => {
    const updates: unknown[] = [];
    const out = await handleRentChargeEvent(adminReturning({ data: row }, (v) => updates.push(v)), stripeWith(Object.assign(new Error("x"), { type: "StripeInvalidRequestError", statusCode: 400 })), refund);
    assert.equal(out, "needs_manual");
    assert.ok(updates.some((u) => (u as { reversal_failed_at?: string }).reversal_failed_at));
  });
  test("transient Stripe error (5xx) still retries", async () => {
    assert.equal(await handleRentChargeEvent(adminReturning({ data: row }), stripeWith(Object.assign(new Error("x"), { statusCode: 503 })), refund), "retry");
  });
  test("classification", () => {
    assert.equal(isPermanentStripeError({ type: "StripeInvalidRequestError" }), true);
    assert.equal(isPermanentStripeError({ statusCode: 429 }), false);
    assert.equal(isPermanentStripeError({ statusCode: 500 }), false);
    assert.equal(isPermanentStripeError(null), false);
  });
});

describe("TUL-1700 consultant P1s", () => {
  const prev = process.env.RENT_AUTOPAY_ENABLED;
  beforeEach(() => { process.env.RENT_AUTOPAY_ENABLED = "1"; });
  afterEach(() => { if (prev === undefined) delete process.env.RENT_AUTOPAY_ENABLED; else process.env.RENT_AUTOPAY_ENABLED = prev; });
  test("(a) an invoice read error in the webhook is 'unavailable' (retried), not 'no invoice yet'", async () => {
    const q: Record<string, unknown> = {};
    let call = 0;
    Object.assign(q, {
      select: () => q, eq: () => q,
      maybeSingle: async () => {
        call += 1;
        // 1st read = the plan (fine), 2nd read = the (plan, month) invoice (fails)
        return call === 1 ? { data: { status: "active", autopay_status: "active", stripe_subscription_id: "sub_1", talent_profile_id: "tp" }, error: null } : { data: null, error: { message: "db down" } };
      },
    });
    assert.equal(await handleRentSubscriptionEvent({ from: () => q } as never, paid(), "us"), "unavailable");
  });

  test("(b) a failed rent-row lookup is LOGGED with the event id and a booking refund still records (not_rent)", async () => {
    const refund = { type: "charge.refunded", id: "evt_77", data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 100, amount_refunded: 100 } } } as unknown as Stripe.Event;
    const stripe = { invoicePayments: { list: async () => ({ data: [{ invoice: "in_1" }] }) } } as never;
    const logs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
    try {
      assert.equal(await handleRentChargeEvent(adminReturning({ error: { message: "relation does not exist" } }), stripe, refund), "not_rent");
    } finally {
      console.error = orig;
    }
    const src = read("src/lib/service-hub/rent/rent-autopay.server.ts");
    assert.match(src, /rent\.autopay\.chargeEvent\.rentRowLookup/);
    assert.match(src, /event \$\{event\.id\}/);
  });

  test("(c) the reversal_failed_at write is checked, and a reader lists the marked rows (null when unreadable)", async () => {
    const src = read("src/lib/service-hub/rent/rent-autopay.server.ts");
    assert.match(src, /const \{ error: markErr \} = await tenantScopedQuery\(admin, "studio_rent_invoices", confirmedRow\.tenantId\)/);
    assert.match(src, /if \(markErr\) logServerError\("rent\.autopay\.chargeEvent\.markFailed"/);
    const rows = [{ id: "r1", tenant_id: "t", plan_id: "p", period: "2026-11", reversal_failed_at: "2026-11-02T00:00:00Z" }];
    const q: Record<string, unknown> = {};
    Object.assign(q, { select: () => q, not: () => q, eq: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) });
    assert.deepEqual(await listRentReversalsToReconcile({ from: () => q } as never, { tenantId: "t" }), [{ id: "r1", tenantId: "t", planId: "p", period: "2026-11", failedAt: "2026-11-02T00:00:00Z" }]);
    const bad: Record<string, unknown> = {};
    Object.assign(bad, { select: () => bad, not: () => bad, order: () => bad, limit: async () => ({ data: null, error: { message: "x" } }) });
    assert.equal(await listRentReversalsToReconcile({ from: () => bad } as never), null);
  });

  test("the migration is renumbered to 20261231423700 (423200 belongs to dated places)", () => {
    assert.match(read("../supabase/migrations/_pending_pm/20261231423700_studio_rent_reversal_marker_tul1700.sql"), /reversal_failed_at/);
    assert.throws(() => read("../supabase/migrations/_pending_pm/20261231423200_studio_rent_reversal_marker_tul1700.sql"));
  });
});

describe("10: copy", () => {
  test("pending never says paid automatically; the owner line never says no link is needed; every new key exists in EN and ES", () => {
    for (const l of ["en", "es"] as const) {
      const c = RENT_COPY[l];
      for (const k of ["autopayPending", "autopayNotAvailable", "autopayStudioNotReady", "paidOutsideHintAutopay", "autopayFutureMonth"] as const) assert.ok(c[k].length > 10, `${l}.${k}`);
      assert.doesNotMatch(c.ownerAutopayPending, /no (hace falta|need)/i);
      assert.doesNotMatch(c.ownerAutopayOn, /No payment link needed|No hace falta enlace/);
      assert.doesNotMatch(c.paidOutsideHint, /automatic|automático/i, "flag-off hint promises no autopay");
    }
    const card = read("src/app/(workspace)/[tenantSlug]/talent/rent-proposals/RentProposalCard.tsx");
    assert.match(card, /p\.autopayStatus === "pending" \? c\.autopayPending/);
  });
  test("the dispute bell says refunds and lost disputes are returned by the studio, in both languages", () => {
    const src = read("src/lib/notifications/catalog-entries-rent.ts");
    assert.match(src, /your studio returns its share of the refunded amount/);
    assert.match(src, /tu estudio devuelve su parte del monto reembolsado/);
  });
});
