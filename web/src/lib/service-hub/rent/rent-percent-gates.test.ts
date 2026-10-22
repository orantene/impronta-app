/** TUL-1717: a percentage the automatic invoice could not carry is marked reliably and collectable through a payment link, once. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type Stripe from "stripe";
import { addPercentToDraft, handleRentUnbilledPercent, markPercentMissed } from "./rent-autopay.server";
import { classifyRentSubscriptionEvent } from "./rent-autopay-routing";
import { issueMissedPercent, percentLineLabel, type CatchupDeps, type CatchupRow } from "./rent-percent-catchup";
import type { RentPlan } from "./rent-cycle";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const DEC1 = Date.UTC(2026, 11, 1) / 1000;

function fakeAdmin(opts: { plan?: Record<string, unknown> | null; readError?: boolean; updateError?: boolean } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const base = { stripe_subscription_id: "sub_1", rent_percent_bps: 1_000, accepted_percent_bps: 1_000, currency: "MXN", talent_profile_id: "tp", autopay_first_period: "2026-11", autopay_skip_periods: [], autopay_percent_missed: [] };
  let mode: "read" | "update" = "read";
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q,
    update: (v: Record<string, unknown>) => { mode = "update"; updates.push(v); return q; },
    maybeSingle: async () => (opts.readError ? { data: null, error: { message: "db down" } } : { data: opts.plan === undefined ? base : opts.plan, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ error: mode === "update" && opts.updateError ? { message: "write failed" } : null }).then(res),
  });
  // TUL-1751: the marker is the atomic rent_mark_percent_missed RPC. This fake behaves like the SQL function over the plan's array.
  const rpc = async (name: string, args: { p_month: string }) => {
    assert.equal(name, "rent_mark_percent_missed");
    if (opts.readError || opts.updateError) return { data: null, error: { message: "rpc failed" } };
    const plan = opts.plan === undefined ? base : opts.plan;
    if (!plan) return { data: "not_found", error: null };
    const current = ((plan as { autopay_percent_missed?: string[] }).autopay_percent_missed ?? []) as string[];
    if (current.includes(args.p_month)) return { data: "already", error: null };
    updates.push({ autopay_percent_missed: [...current, args.p_month] });
    return { data: "marked", error: null };
  };
  return { admin: { from: () => q, rpc } as never, updates };
}

describe("markPercentMissed never swallows a failed read", () => {
  test("an RPC error is 'error' and NOTHING is written (the webhook retries)", async () => {
    const f = fakeAdmin({ readError: true });
    assert.equal(await markPercentMissed(f.admin, { tenantId: "t", planId: "p", month: "2026-11", reason: "finalized" }), "error");
    assert.deepEqual(f.updates, []);
  });
  test("a missing plan is an error; a failed write is an error; an existing month is 'already'; a new one is marked and keeps the others", async () => {
    assert.equal(await markPercentMissed(fakeAdmin({ plan: null }).admin, { tenantId: "t", planId: "p", month: "2026-11", reason: "flag_off" }), "error");
    assert.equal(await markPercentMissed(fakeAdmin({ updateError: true }).admin, { tenantId: "t", planId: "p", month: "2026-11", reason: "flag_off" }), "error");
    assert.equal(await markPercentMissed(fakeAdmin({ plan: { autopay_percent_missed: ["2026-11"] } }).admin, { tenantId: "t", planId: "p", month: "2026-11", reason: "flag_off" }), "already");
    const f = fakeAdmin({ plan: { autopay_percent_missed: ["2026-10"] } });
    assert.equal(await markPercentMissed(f.admin, { tenantId: "t", planId: "p", month: "2026-11", reason: "finalized" }), "marked");
    assert.deepEqual(f.updates, [{ autopay_percent_missed: ["2026-10", "2026-11"] }]);
  });
});

describe("addPercentToDraft: the stamp check runs BEFORE the switch check", () => {
  const draft = { type: "draft", planId: "p", tenantId: "t", subscriptionId: "sub_1", invoiceId: "in_1", customerId: "cus", periodStart: DEC1, currency: "mxn", percentAdded: false, feeBps: 150 } as never;
  const stripeWith = (invoice: Record<string, unknown>) => ({ invoices: { retrieve: async () => invoice, update: async () => ({}) }, invoiceItems: { create: async () => ({}) } }) as unknown as Stripe;
  const prev = process.env.RENT_AUTOPAY_PERCENT_ENABLED;
  beforeEach(() => { delete process.env.RENT_AUTOPAY_PERCENT_ENABLED; });
  afterEach(() => { if (prev === undefined) delete process.env.RENT_AUTOPAY_PERCENT_ENABLED; else process.env.RENT_AUTOPAY_PERCENT_ENABLED = prev; });

  test("switch OFF but the live invoice is already stamped: it was billed, so the month is NOT marked missed", async () => {
    const f = fakeAdmin();
    assert.equal(await addPercentToDraft(f.admin, stripeWith({ status: "open", metadata: { rent_percent_cents: "100" } }), draft), "skipped");
    assert.deepEqual(f.updates, []);
  });
  test("switch OFF and unstamped: the month is marked; a marker that cannot be written is 'retry', not a silent skip", async () => {
    const ok = fakeAdmin();
    assert.equal(await addPercentToDraft(ok.admin, stripeWith({ status: "draft", metadata: {} }), draft), "skipped");
    assert.deepEqual(ok.updates, [{ autopay_percent_missed: ["2026-11"] }]);
    const bad = fakeAdmin({ updateError: true });
    assert.equal(await addPercentToDraft(bad.admin, stripeWith({ status: "draft", metadata: {} }), draft), "retry");
  });
  test("switch ON and the invoice is no longer a draft: marked; a failed marker retries", async () => {
    process.env.RENT_AUTOPAY_PERCENT_ENABLED = "1";
    assert.equal(await addPercentToDraft(fakeAdmin({ updateError: true }).admin, stripeWith({ status: "open", metadata: {} }), draft), "retry");
    const f = fakeAdmin();
    assert.equal(await addPercentToDraft(f.admin, stripeWith({ status: "open", metadata: {} }), draft), "skipped");
    assert.deepEqual(f.updates, [{ autopay_percent_missed: ["2026-11"] }]);
  });
});

describe("an invoice that reaches us past its draft window", () => {
  const meta = { checkout_type: "rent_subscription", rent_plan_id: "p", tenant_id: "t", rent_cents: "0", fee_bps: "150" };
  const inv = (over: Record<string, unknown>) => ({ id: "in_1", billing_reason: "subscription_cycle", customer: "cus", currency: "mxn", period_start: DEC1, status: "open", parent: { subscription_details: { subscription: "sub_1", metadata: meta } }, ...over });
  const ev = (type: string, over: Record<string, unknown>) => ({ type, data: { object: inv(over) } }) as unknown as Stripe.Event;

  test("routing: invoice.created already open, and invoice.finalized, are past_draft; a draft stays a draft; the sign-up invoice and strangers are ignored", () => {
    assert.deepEqual(classifyRentSubscriptionEvent(ev("invoice.created", {})), { type: "past_draft", planId: "p", tenantId: "t", subscriptionId: "sub_1", invoiceId: "in_1", periodStart: DEC1, stamped: false });
    assert.equal(classifyRentSubscriptionEvent(ev("invoice.created", { status: "draft" }))?.type, "draft");
    const fin = classifyRentSubscriptionEvent(ev("invoice.finalized", { metadata: { rent_percent_cents: "0" } }));
    assert.equal(fin?.type === "past_draft" && fin.stamped, true);
    assert.equal(classifyRentSubscriptionEvent(ev("invoice.finalized", { billing_reason: "subscription_create" })), null);
    assert.equal(classifyRentSubscriptionEvent(ev("invoice.finalized", { parent: { subscription_details: { subscription: "sub_1", metadata: { plan: "pro" } } } })), null);
  });

  const past = { type: "past_draft", planId: "p", tenantId: "t", subscriptionId: "sub_1", invoiceId: "in_1", periodStart: DEC1, stamped: false } as const;
  test("an unstamped invoice of a percentage plan: the month is marked; a stamped one, a fixed-only plan, a foreign subscription and a month taken outside are skipped", async () => {
    const f = fakeAdmin();
    assert.equal(await handleRentUnbilledPercent(f.admin, past), "marked");
    assert.deepEqual(f.updates, [{ autopay_percent_missed: ["2026-11"] }]);
    assert.equal(await handleRentUnbilledPercent(fakeAdmin().admin, { ...past, stamped: true }), "skipped");
    assert.equal(await handleRentUnbilledPercent(fakeAdmin({ plan: { stripe_subscription_id: "sub_1", rent_percent_bps: 0, accepted_percent_bps: 0, autopay_first_period: "2026-11", autopay_skip_periods: [] } }).admin, past), "skipped");
    assert.equal(await handleRentUnbilledPercent(fakeAdmin().admin, { ...past, subscriptionId: "sub_other" }), "skipped");
    assert.equal(await handleRentUnbilledPercent(fakeAdmin({ plan: { stripe_subscription_id: "sub_1", rent_percent_bps: 1000, accepted_percent_bps: 1000, autopay_first_period: "2026-11", autopay_skip_periods: ["2026-11"] } }).admin, past), "skipped");
  });
  test("an unreadable plan or an unwritable marker is 'retry' (Stripe redelivers), never a silent skip", async () => {
    assert.equal(await handleRentUnbilledPercent(fakeAdmin({ readError: true }).admin, past), "retry");
    assert.equal(await handleRentUnbilledPercent(fakeAdmin({ updateError: true }).admin, past), "retry");
  });
  test("wiring: the webhook retries on it, and the endpoint script subscribes invoice.finalized", () => {
    assert.match(read("src/lib/stripe/webhook-handler.ts"), /rent\.type === "past_draft"[\s\S]*?handleRentUnbilledPercent\(sb, rent\)\) === "retry"\) throw new TransientWebhookError/);
    assert.match(read("../scripts/ops/configure-stripe-webhook.sh"), /^\s+invoice\.finalized$/m);
  });
});

describe("collecting a missed month through a payment link", () => {
  const plan = { id: "p", tenantId: "t", talentProfileId: "tp", monthlyRentCents: 50_000, percentBps: 1_000, currency: "MXN", acceptedAt: "x", acceptedPercentBps: 1_000 } as RentPlan;
  function deps(over: Partial<CatchupDeps> & { rowStatus?: CatchupRow["status"]; missed?: string[] | null } = {}) {
    const calls: string[] = [];
    let row: CatchupRow | null = null;
    const d: CatchupDeps = {
      gate: () => ({ ok: true }),
      loadPlan: async () => plan,
      loadMissedMonths: async () => (over.missed === undefined ? ["2026-11"] : over.missed),
      loadSalesBase: async () => 1_000_000,
      claim: async (r) => {
        calls.push("claim");
        row = row ?? { id: "row-1", planId: r.planId, salesMonth: r.salesMonth, amountCents: r.amountCents, currency: r.currency, orderId: null, status: over.rowStatus ?? "issuing" };
        return { ...row }; // a snapshot, like a database read
      },
      createOrder: async (i) => { calls.push(`order:${i.amountCents}:${i.label}`); return { ok: true, orderId: "ord-1", needsApproval: false }; },
      saveOrder: async (_id, orderId) => { if (row) row.orderId = orderId; return true; },
      readOrderId: async () => row?.orderId ?? null,
      mintLink: async (i) => { calls.push(`link:${i.idempotencyKey}`); return { ok: true, code: "CODE1", url: "https://pay/CODE1" }; },
      markIssued: async () => { if (row) row.status = "issued"; return true; },
      ...over,
    };
    return { d, calls };
  }
  const input = { tenantId: "t", planId: "p", salesMonth: "2026-11", locale: "en" as const };

  test("the percentage of the closed month's sales becomes ONE order line and ONE idempotent link; a repeat reuses both", async () => {
    const x = deps();
    const first = await issueMissedPercent(input, x.d);
    assert.deepEqual(first, { ok: true, rowId: "row-1", code: "CODE1", url: "https://pay/CODE1", already: false });
    assert.deepEqual(x.calls, ["claim", "order:100000:Station rent: 10% of your sales, November 2026", "link:rentpct:row-1"]);
    const again = await issueMissedPercent(input, x.d);
    assert.equal(again.ok && again.already, true);
    assert.equal(x.calls.filter((c) => c.startsWith("order:")).length, 1, "the order is made once");
  });
  test("refusals: gate, not accepted, fixed-only, a month that was not missed, unreadable missed list, no sales base, nothing due, paid, void", async () => {
    const r = async (d: CatchupDeps) => (await issueMissedPercent(input, d)).ok ? "ok" : (await issueMissedPercent(input, d) as { reason: string }).reason;
    assert.equal(await r(deps({ gate: () => ({ ok: false, reason: "disabled" }) }).d), "disabled");
    assert.equal(await r(deps({ loadPlan: async () => ({ ...plan, acceptedAt: null }) }).d), "not_accepted");
    assert.equal(await r(deps({ loadPlan: async () => ({ ...plan, percentBps: 0, acceptedPercentBps: 0 }) }).d), "not_a_percentage_plan");
    assert.equal(await r(deps({ missed: ["2026-10"] }).d), "not_missed");
    assert.equal(await r(deps({ missed: null }).d), "unavailable");
    assert.equal(await r(deps({ loadSalesBase: async () => null }).d), "sales_unavailable");
    assert.equal(await r(deps({ loadSalesBase: async () => 0 }).d), "nothing_due");
    assert.equal(await r(deps({ rowStatus: "paid" }).d), "already_paid");
    assert.equal(await r(deps({ rowStatus: "void" }).d), "void");
    assert.equal((await issueMissedPercent({ ...input, salesMonth: "2026-13" }, deps().d) as { reason: string }).reason, "bad_period");
  });
  test("a failed order or link is 'unavailable' (nothing half-issued is reported as done)", async () => {
    assert.equal((await issueMissedPercent(input, deps({ createOrder: async () => ({ ok: false }) }).d) as { reason: string }).reason, "unavailable");
    assert.equal((await issueMissedPercent(input, deps({ mintLink: async () => ({ ok: false, reason: "x" }) }).d) as { reason: string }).reason, "unavailable");
    assert.equal((await issueMissedPercent(input, deps({ markIssued: async () => false }).d) as { reason: string }).reason, "unavailable");
  });
  test("the line text is bilingual", () => {
    assert.equal(percentLineLabel("2026-11", 1_000, "en"), "Station rent: 10% of your sales, November 2026");
    assert.match(percentLineLabel("2026-11", 1_000, "es"), /^Renta de estación: 10% de tus ventas de noviembre de 2026$/);
  });
  test("the table keys a month once per plan and is service-role-written (held migration 424600)", () => {
    const sql = read("../supabase/migrations/_pending_pm/20261231424600_studio_rent_percent_catchups_tul1717.sql").replace(/^\s*--.*$/gm, "");
    assert.match(sql, /CONSTRAINT studio_rent_percent_catchups_one_per_month UNIQUE \(plan_id, sales_month\)/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /FOR SELECT TO authenticated/);
    assert.doesNotMatch(sql, /FOR (INSERT|UPDATE|DELETE|ALL)/);
  });
  test("the owner action is guarded by the capability in the staff guard itself (no second hand-rolled capability check)", () => {
    const src = read("src/lib/service-hub/rent/rent-percent-catchup-actions.ts");
    assert.match(src, /requireWorkspaceStaffAction\(\{ capability: "booking\.payment\.request" \}\)/);
    assert.doesNotMatch(src, /userHasCapability/);
  });
});
