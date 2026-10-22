import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { computeRentAmount, decideRentIssue, matchesAcceptedTerms, validateRentProposal, type RentPlan } from "./rent-cycle";
import { issueRentInvoice, type RentIssueDeps, type RentInvoiceRow } from "./rent-issue";

const plan = (over: Partial<RentPlan> = {}): RentPlan => ({
  id: "plan-1", tenantId: "t-1", talentProfileId: "tp-1",
  monthlyRentCents: 50_000, percentBps: 1_000, currency: "MXN", startsOn: "2026-08-01",
  status: "active", acceptedAt: "2026-08-01T10:00:00Z",
  acceptedAmountCents: 50_000, acceptedPercentBps: 1_000, acceptedCurrency: "MXN", termsVersion: 1, acceptedTermsVersion: 1,
  ...over,
});
const NOW = new Date("2026-10-20T12:00:00Z");

describe("rent = fixed + a percentage of the member's sales", () => {
  test("half-up rounding on the percentage, fixed added exactly", () => {
    assert.equal(computeRentAmount({ fixedCents: 50_000, percentBps: 1_000, salesBaseCents: 123_456 }), 50_000 + 12_346); // 12345.6 -> 12346
    assert.equal(computeRentAmount({ fixedCents: 0, percentBps: 500, salesBaseCents: 10_010 }), 501); // 500.5 -> 501
    assert.equal(computeRentAmount({ fixedCents: 120_000, percentBps: 0, salesBaseCents: 999_999 }), 120_000, "fixed-only ignores sales");
  });
  test("a percentage with no usable sales base fails closed", () => {
    for (const salesBaseCents of [null, -1, Number.NaN, 1.5]) assert.equal(computeRentAmount({ fixedCents: 0, percentBps: 1_000, salesBaseCents }), null);
  });
  test("the percentage is capped at 90% (the member keeps at least 10%)", () => {
    assert.deepEqual(validateRentProposal({ monthlyRentCents: 0, percentBps: 9_000, currency: "MXN", startsOn: "2026-09-01" }), { ok: true });
    assert.deepEqual(validateRentProposal({ monthlyRentCents: 0, percentBps: 9_001, currency: "MXN", startsOn: "2026-09-01" }), { ok: false, reason: "percent" });
    assert.deepEqual(validateRentProposal({ monthlyRentCents: 0, percentBps: 12.5, currency: "MXN", startsOn: "2026-09-01" }), { ok: false, reason: "percent" });
  });
  test("a proposal needs a fixed amount, a percentage, or both; never nothing", () => {
    assert.deepEqual(validateRentProposal({ monthlyRentCents: 0, percentBps: 0, currency: "MXN", startsOn: "2026-09-01" }), { ok: false, reason: "amount" });
    assert.deepEqual(validateRentProposal({ monthlyRentCents: 50_000, percentBps: 1_000, currency: "MXN", startsOn: "2026-09-01" }), { ok: true });
    assert.deepEqual(validateRentProposal({ monthlyRentCents: 50_000, currency: "MXN", startsOn: "2026-09-01" }), { ok: true });
  });
});

describe("issuing a percentage month", () => {
  test("only a CLOSED month is billed (the sales are final), not the current one", () => {
    assert.deepEqual(decideRentIssue({ plan: plan(), period: "2026-10", now: NOW, salesBaseCents: 100_000 }), { ok: false, reason: "month_not_closed" });
    assert.deepEqual(decideRentIssue({ plan: plan(), period: "2026-09", now: NOW, salesBaseCents: 100_000 }), { ok: true, amountCents: 60_000, currency: "MXN" });
  });
  test("no sales base: refused; nothing due: refused, no zero invoice", () => {
    assert.deepEqual(decideRentIssue({ plan: plan(), period: "2026-09", now: NOW, salesBaseCents: null }), { ok: false, reason: "sales_unavailable" });
    assert.deepEqual(decideRentIssue({ plan: plan({ monthlyRentCents: 0, acceptedAmountCents: 0 }), period: "2026-09", now: NOW, salesBaseCents: 0 }), { ok: false, reason: "nothing_due" });
  });
  test("a fixed-only plan still bills the current month, as before", () => {
    const p = plan({ percentBps: 0, acceptedPercentBps: 0 });
    assert.deepEqual(decideRentIssue({ plan: p, period: "2026-10", now: NOW }), { ok: true, amountCents: 50_000, currency: "MXN" });
  });
});

describe("approval: the terms the member accepted, not a fixed invoice amount", () => {
  test("a percentage plan matches while fixed part, percentage, currency and version equal what she accepted", () => {
    assert.equal(matchesAcceptedTerms(plan(), { amountCents: 61_234, currency: "MXN" }), true);
  });
  test("any change to the terms does not match", () => {
    assert.equal(matchesAcceptedTerms(plan({ percentBps: 1_500 }), { amountCents: 60_000, currency: "MXN" }), false);
    assert.equal(matchesAcceptedTerms(plan({ monthlyRentCents: 60_000 }), { amountCents: 60_000, currency: "MXN" }), false);
    assert.equal(matchesAcceptedTerms(plan({ acceptedPercentBps: null }), { amountCents: 60_000, currency: "MXN" }), false);
    assert.equal(matchesAcceptedTerms(plan({ termsVersion: 2 }), { amountCents: 60_000, currency: "MXN" }), false);
  });
});

describe("the sales base comes from the store and the invoice freezes the result", () => {
  function world(base: number | null) {
    const invoices = new Map<string, RentInvoiceRow>();
    const asked: unknown[] = [];
    const deps: RentIssueDeps = {
      gate: () => ({ ok: true }),
      now: () => NOW,
      async loadPlan() { return plan(); },
      async loadSalesBase(q) { asked.push(q); return base; },
      async claimInvoice(row) {
        const key = `${row.planId}:${row.period}`;
        const ex = invoices.get(key);
        if (ex) return ex;
        const c: RentInvoiceRow = { id: "inv-1", planId: row.planId, period: row.period, amountCents: row.amountCents, currency: row.currency, orderId: null, status: "issuing" };
        invoices.set(key, c);
        return c;
      },
      async createOrder(i) { return { ok: true, orderId: `ord-${i.amountCents}`, needsApproval: false }; },
      async saveOrder() { return true; },
      async readOrderId() { return null; },
      async mintLink(i) { return { ok: true, code: `c-${i.amountCents}`, url: `u/${i.amountCents}` }; },
      async markIssued() { return "issued" as const; },
      async voidMintedLink() { return true; },
    };
    return { deps, invoices, asked };
  }
  const ARGS = { tenantId: "t-1", planId: "plan-1", period: "2026-09", locale: "en" as const };

  test("the invoice is fixed + percentage of the sales base, in the plan's currency", async () => {
    const w = world(100_000);
    const r = await issueRentInvoice(ARGS, w.deps);
    assert.equal(r.ok && r.url, "u/60000");
    assert.deepEqual(w.asked, [{ tenantId: "t-1", talentProfileId: "tp-1", period: "2026-09", currency: "MXN" }]);
  });
  test("an unreadable sales base issues nothing", async () => {
    const w = world(null);
    assert.deepEqual(await issueRentInvoice(ARGS, w.deps), { ok: false, reason: "sales_unavailable" });
    assert.equal(w.invoices.size, 0);
  });
  test("a repeat click keeps the first amount even if the base moved (refunds): the invoice is frozen", async () => {
    const w = world(100_000);
    await issueRentInvoice(ARGS, w.deps);
    w.deps.loadSalesBase = async () => 40_000;
    const again = await issueRentInvoice(ARGS, w.deps);
    assert.equal(again.ok && again.url, "u/60000");
  });
});

describe("the sales base query", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-sales-base.server.ts"), "utf8");
  test("counts paid, fulfilled or partially refunded orders of THIS workspace in the plan currency, net of refunds (details in rent-sales-paging.test.ts)", () => {
    assert.match(src, /tenantScopedQuery\(admin, "order_lines", p\.tenantId\)/);
    assert.match(src, /\["paid", "fulfilled", "partially_refunded"\]/);
    assert.match(src, /\.eq\("currency", p\.currency\)/);
    assert.match(src, /refunded_cents/);
  });
});

describe("the held migration (TUL-1466)", () => {
  const sql = readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231423010_studio_rent_percent_tul1466.sql"), "utf8").replace(/^\s*--.*$/gm, "");
  test("adds the percentage columns with the 90% cap and backfills accepted plans before the stricter check", () => {
    assert.match(sql, /rent_percent_bps integer NOT NULL DEFAULT 0\s+CHECK \(rent_percent_bps >= 0 AND rent_percent_bps <= 9000\)/);
    assert.match(sql, /accepted_percent_bps integer NULL/);
    assert.ok(sql.indexOf("SET accepted_percent_bps = 0") < sql.indexOf("ADD CONSTRAINT studio_rent_plans_accepted CHECK"));
  });
  test("a fixed amount, a percentage, or both; never nothing", () => {
    assert.match(sql, /CHECK \(monthly_rent_cents > 0 OR rent_percent_bps > 0\)/);
  });
  test("the earlier migration is not edited: it is already on main", () => {
    const first = readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231420700_studio_rent_tul1376.sql"), "utf8");
    assert.doesNotMatch(first, /rent_percent_bps/);
  });
});
