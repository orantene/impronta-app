import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { issueRentInvoice, rentLinkKey, type RentInvoiceRow, type RentIssueDeps } from "./rent-issue";
import type { RentPlan } from "./rent-cycle";

const PLAN: RentPlan = {
  id: "plan-1",
  tenantId: "t-1",
  talentProfileId: "tp-1",
  monthlyRentCents: 120000,
  currency: "MXN",
  startsOn: "2026-09-01",
  status: "active",
  acceptedAt: "2026-08-30T10:00:00Z",
  acceptedAmountCents: 120000,
  acceptedCurrency: "MXN",
  termsVersion: 1,
  acceptedTermsVersion: 1,
};

function world(over: { plan?: RentPlan | null; mintFails?: boolean; needsApproval?: boolean; gate?: boolean } = {}) {
  const state = { mintFails: over.mintFails === true, loseRace: false };
  const created: Array<{ matches: boolean; invoiceId: string }> = [];
  const invoices = new Map<string, RentInvoiceRow>();
  const orders: Array<{ label: string; amountCents: number; currency: string; tenantId: string }> = [];
  const links = new Map<string, string>();
  const calls = { mint: 0 };
  const deps: RentIssueDeps = {
    gate: () => (over.gate === false ? { ok: false, reason: "disabled" } : { ok: true }),
    now: () => new Date("2026-10-20T12:00:00Z"),
    async loadPlan(planId, tenantId) {
      const p = over.plan === undefined ? PLAN : over.plan;
      return p && p.id === planId && p.tenantId === tenantId ? p : null;
    },
    async claimInvoice(row) {
      const key = `${row.planId}:${row.period}`;
      const existing = invoices.get(key);
      if (existing) return existing;
      const created: RentInvoiceRow = { id: `inv-${invoices.size + 1}`, planId: row.planId, period: row.period, amountCents: row.amountCents, currency: row.currency, orderId: null, status: "issuing" };
      invoices.set(key, created);
      return created;
    },
    async createOrder(input) {
      created.push({ matches: input.matchesAcceptedTerms, invoiceId: input.invoiceId });
      orders.push({ label: input.label, amountCents: input.amountCents, currency: input.currency, tenantId: input.tenantId });
      return { ok: true, orderId: `ord-${orders.length}`, needsApproval: over.needsApproval === true };
    },
    async saveOrder(invoiceId, orderId) {
      for (const inv of invoices.values()) {
        if (inv.id !== invoiceId) continue;
        // 0 rows updated when an order is already there, or when a concurrent request just won.
        if (inv.orderId || state.loseRace) {
          if (state.loseRace && !inv.orderId) inv.orderId = "ord-winner";
          return false;
        }
        inv.orderId = orderId;
        return true;
      }
      return false;
    },
    async readOrderId(invoiceId) {
      for (const inv of invoices.values()) if (inv.id === invoiceId) return inv.orderId;
      return null;
    },
    async mintLink(input) {
      calls.mint += 1;
      if (state.mintFails) return { ok: false, reason: "provider_unavailable" };
      const code = links.get(input.idempotencyKey) ?? `code-${links.size + 1}`;
      links.set(input.idempotencyKey, code);
      return { ok: true, code, url: `https://pay.test/${code}` };
    },
    async markIssued(invoiceId, code) {
      for (const inv of invoices.values()) if (inv.id === invoiceId) { inv.status = "issued"; void code; }
      return true;
    },
  };
  return { deps, invoices, orders, links, calls, state, created };
}
const ARGS = { tenantId: "t-1", planId: "plan-1", period: "2026-10", locale: "en" as const };

describe("issue one month of rent", () => {
  test("creates one invoice, one order with one rent line at the plan's rent, one link", async () => {
    const w = world();
    const r = await issueRentInvoice(ARGS, w.deps);
    assert.equal(r.ok, true);
    assert.equal(w.invoices.size, 1);
    assert.deepEqual(w.orders, [{ label: "Station rent, October 2026", amountCents: 120000, currency: "MXN", tenantId: "t-1" }]);
    assert.equal(w.links.get(rentLinkKey("inv-1")), "code-1");
  });

  test("a double click or replay returns the same link and never a second order or invoice", async () => {
    const w = world();
    const a = await issueRentInvoice(ARGS, w.deps);
    const b = await issueRentInvoice(ARGS, w.deps);
    assert.equal(a.ok && b.ok, true);
    if (a.ok && b.ok) {
      assert.equal(a.code, b.code);
      assert.equal(b.already, true);
    }
    assert.equal(w.invoices.size, 1);
    assert.equal(w.orders.length, 1);
  });

  test("a crash after the order was made (link failed) retries on the SAME order", async () => {
    const w = world({ mintFails: true });
    assert.deepEqual(await issueRentInvoice(ARGS, w.deps), { ok: false, reason: "unavailable" });
    w.state.mintFails = false;
    const again = await issueRentInvoice(ARGS, w.deps);
    assert.equal(again.ok, true);
    assert.equal(w.orders.length, 1, "no second order");
  });

  test("the amount comes from the invoice row frozen at the first issue, not a later plan edit", async () => {
    const w = world({ mintFails: true });
    await issueRentInvoice(ARGS, w.deps);
    const cheaper = { ...PLAN, monthlyRentCents: 50000 };
    w.deps.loadPlan = async () => cheaper;
    w.deps.mintLink = async (i) => ({ ok: true, code: "c", url: `u/${i.amountCents}` });
    const r = await issueRentInvoice(ARGS, w.deps);
    assert.equal(r.ok && r.url, "u/120000");
  });

  test("another workspace's plan id is not found", async () => {
    const w = world();
    assert.deepEqual(await issueRentInvoice({ ...ARGS, tenantId: "t-2" }, w.deps), { ok: false, reason: "plan_not_found" });
    assert.equal(w.invoices.size, 0);
  });

  test("gate off: nothing is read or written", async () => {
    const w = world({ gate: false });
    assert.deepEqual(await issueRentInvoice(ARGS, w.deps), { ok: false, reason: "disabled" });
    assert.equal(w.invoices.size, 0);
    assert.equal(w.orders.length, 0);
  });

  test("plan not accepted by the member: refused before any row exists", async () => {
    const w = world({ plan: { ...PLAN, acceptedAt: null, status: "proposed" } });
    assert.deepEqual(await issueRentInvoice(ARGS, w.deps), { ok: false, reason: "not_accepted" });
    assert.equal(w.invoices.size, 0);
  });

  test("a paid or void month is never issued again", async () => {
    const w = world();
    await issueRentInvoice(ARGS, w.deps);
    const inv = [...w.invoices.values()][0];
    inv.status = "paid";
    assert.deepEqual(await issueRentInvoice(ARGS, w.deps), { ok: false, reason: "already_paid" });
    inv.status = "void";
    assert.deepEqual(await issueRentInvoice(ARGS, w.deps), { ok: false, reason: "void" });
  });

  test("a rent line over the workspace's custom-amount limit stops for approval, no link", async () => {
    const w = world({ needsApproval: true });
    assert.deepEqual(await issueRentInvoice(ARGS, w.deps), { ok: false, reason: "needs_approval" });
    assert.equal(w.calls.mint, 0);
  });

  test("RACE: two requests both made an order; the loser links the winner's order, never a second", async () => {
    const w = world();
    w.state.loseRace = true;
    const minted: string[] = [];
    const baseMint = w.deps.mintLink;
    w.deps.mintLink = async (i) => { minted.push(i.orderId); return baseMint(i); };
    const r = await issueRentInvoice(ARGS, w.deps);
    assert.equal(r.ok, true);
    assert.deepEqual(minted, ["ord-winner"], "the link is minted on the winner's order");
    assert.equal([...w.invoices.values()][0].orderId, "ord-winner", "the invoice keeps exactly one order");
  });

  test("RACE: if the winner's order cannot be read, nothing is minted (fail closed)", async () => {
    const w = world();
    w.state.loseRace = true;
    w.deps.readOrderId = async () => null;
    assert.deepEqual(await issueRentInvoice(ARGS, w.deps), { ok: false, reason: "unavailable" });
    assert.equal(w.calls.mint, 0);
  });

  test("an invoice equal to what the member accepted asks for the approval to be recorded; a different amount does not", async () => {
    const same = world();
    await issueRentInvoice(ARGS, same.deps);
    assert.equal(same.created[0].matches, true);
    const edited = world({ plan: { ...PLAN, monthlyRentCents: 150000 } });
    await issueRentInvoice(ARGS, edited.deps);
    assert.equal(edited.created[0].matches, false, "a changed amount still goes through approval");
  });
});
