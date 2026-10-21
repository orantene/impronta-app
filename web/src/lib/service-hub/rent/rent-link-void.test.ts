/** TUL-1719: a card payment over a month with an ISSUED, UNPAID payment link voids the link; it never overwrites a paid or outside row. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { applyRentSubscriptionEvent, type AutopayInvoiceRow, type RentAutopayApplyDeps } from "./rent-autopay-apply";

const NOV1 = Date.UTC(2026, 10, 1) / 1000;
const paid = { type: "paid", planId: "p", tenantId: "t", subscriptionId: "sub_1", invoiceId: "in_1", periodStart: NOV1, amountPaid: 121_800, currency: "mxn", rentCents: 120_000 } as const;

function world(existing: AutopayInvoiceRow | null, voided: "cancelled" | "paid" | "failed" = "cancelled") {
  const calls: string[] = [];
  const written: Array<{ status: string; replacesLink?: boolean }> = [];
  const deps: RentAutopayApplyDeps = {
    loadPlan: async () => ({ status: "active", autopayStatus: "active", subscriptionId: "sub_1", talentProfileId: "tp" }),
    setAutopay: async () => true,
    loadInvoice: async () => existing,
    writeInvoice: async (r) => { calls.push("write"); written.push({ status: r.status, replacesLink: r.replacesLink }); return true; },
    voidIssuedLink: async () => { calls.push("void"); return voided; },
    cancelSubscription: async () => true,
    notify: async () => {},
    alert: (m) => { calls.push(`alert:${m.slice(0, 40)}`); },
  };
  return { deps, calls, written };
}
const link = (status: string): AutopayInvoiceRow => ({ status, stripeInvoiceId: null, source: "link" });

describe("an issued, unpaid payment link on a month the card just paid", () => {
  for (const status of ["issued", "issuing"]) {
    test(`link row '${status}': the link is voided FIRST, then the month becomes the automatic payment's (the row replaces the link)`, async () => {
      const w = world(link(status));
      assert.equal(await applyRentSubscriptionEvent(paid, w.deps), "paid_recorded");
      assert.deepEqual(w.calls, ["void", "write"], "void before any write");
      assert.deepEqual(w.written, [{ status: "paid", replacesLink: true }]);
    });
  }
  test("the link turns out to be PAID: a real double payment, alerted, nothing overwritten", async () => {
    const w = world(link("issued"), "paid");
    assert.equal(await applyRentSubscriptionEvent(paid, w.deps), "double_payment_alert");
    assert.ok(w.calls.some((c) => c.startsWith("alert")));
    assert.ok(!w.calls.includes("write"));
  });
  test("the link could not be confirmed voided: retry (Stripe redelivers), nothing written, alert", async () => {
    const w = world(link("issued"), "failed");
    assert.equal(await applyRentSubscriptionEvent(paid, w.deps), "unavailable");
    assert.ok(!w.calls.includes("write"));
    assert.ok(w.calls.some((c) => c.startsWith("alert")));
  });
});

describe("rows that are NOT an issued link are never touched", () => {
  test("a paid link row, an outside row and a failed link row: alert + double_payment_alert, no void, no write", async () => {
    for (const row of [link("paid"), { status: "paid", stripeInvoiceId: null, source: "outside" }, link("failed"), link("void")] as AutopayInvoiceRow[]) {
      const w = world(row);
      assert.equal(await applyRentSubscriptionEvent(paid, w.deps), "double_payment_alert", `${row.source}/${row.status}`);
      assert.ok(!w.calls.includes("void") && !w.calls.includes("write"), `${row.source}/${row.status}`);
    }
  });
  test("an automatic row of its own, or no row, is recorded normally and never voids anything", async () => {
    for (const row of [null, { status: "failed", stripeInvoiceId: "in_old", source: "autopay" } as AutopayInvoiceRow]) {
      const w = world(row);
      assert.equal(await applyRentSubscriptionEvent(paid, w.deps), "paid_recorded");
      assert.ok(!w.calls.includes("void"));
      assert.deepEqual(w.written, [{ status: "paid", replacesLink: false }]);
    }
  });
});

describe("the server dependency", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-autopay.server.ts"), "utf8");
  test("voids only an OPEN link through the shared cancelPaymentLink, and treats a paid one as a double payment", () => {
    const at = src.indexOf("async voidIssuedLink");
    assert.ok(at > 0);
    const body = src.slice(at, at + 1400);
    assert.match(body, /if \(l\.status === "paid"\) return "paid";/);
    assert.match(body, /if \(l\.status !== "open"\) return "cancelled";/);
    assert.match(body, /cancelPaymentLink\(admin, \{ tenantId, linkId: l\.id \}\)/);
    assert.match(body, /catch \(err\) \{[\s\S]*return "failed";/, "an error is 'failed' (retry), never 'cancelled'");
  });
  test("the voided link row becomes the automatic payment's: its link code is cleared in the same upsert", () => {
    assert.match(src, /\.\.\.\(row\.replacesLink \? \{ payment_link_code: null \} : \{\}\)/);
  });
});
