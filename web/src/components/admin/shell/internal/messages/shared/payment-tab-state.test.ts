import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paymentTabView, withLoadTimeout, PAYMENT_LOAD_TIMEOUT_MS } from "./payment-tab-state";

const txn = (over: Record<string, unknown>) => ({
  status: "paid",
  provider: "stripe",
  grossAmountCents: 150000,
  currency: "MXN",
  paidAt: "2026-10-14T15:00:00.000Z",
  refundedAt: null,
  failureReason: null,
  ...over,
});

describe("paymentTabView", () => {
  it("is loading only while the read is in flight", () => {
    assert.equal(paymentTabView({ loading: true, failed: false, state: null }, "es").kind, "loading");
  });
  it("a failed read is an error state, never loading or 'no booking'", () => {
    const v = paymentTabView({ loading: false, failed: true, state: null }, "es");
    assert.equal(v.kind, "error");
    assert.equal(v.label, "No se pudo cargar el pago");
  });
  it("no booking / no transaction resolve to their own states", () => {
    assert.equal(paymentTabView({ loading: false, failed: false, state: null }, "es").kind, "none");
    assert.equal(paymentTabView({ loading: false, failed: false, state: { bookingId: "b", transaction: null } }, "es").kind, "none");
  });
  it("paid shows amount, date and method (Spanish first)", () => {
    const v = paymentTabView({ loading: false, failed: false, state: { bookingId: "b", transaction: txn({}) } }, "es");
    assert.equal(v.kind, "paid");
    assert.equal(v.label, "Pagado");
    const labels = v.rows.map((r) => r.label);
    assert.deepEqual(labels, ["Monto", "Fecha", "Método"]);
    assert.match(v.rows[0].value, /1,?500/);
    assert.equal(v.rows[2].value, "Tarjeta");
  });
  it("payout states still read as paid to the talent", () => {
    assert.equal(paymentTabView({ loading: false, failed: false, state: { bookingId: "b", transaction: txn({ status: "payout_sent" }) } }, "en").kind, "paid");
  });
  it("refunded and failed resolve", () => {
    const r = paymentTabView({ loading: false, failed: false, state: { bookingId: "b", transaction: txn({ status: "refunded", refundedAt: "2026-10-15T10:00:00.000Z" }) } }, "en");
    assert.equal(r.kind, "refunded");
    assert.equal(r.label, "Refunded");
    const f = paymentTabView({ loading: false, failed: false, state: { bookingId: "b", transaction: txn({ status: "failed", paidAt: null, failureReason: "card_declined" }) } }, "es");
    assert.equal(f.kind, "failed");
    assert.ok(f.rows.some((row) => row.value === "card_declined"));
  });
  it("requested / pending read as pending", () => {
    for (const s of ["draft", "payment_requested", "pending"]) {
      assert.equal(paymentTabView({ loading: false, failed: false, state: { bookingId: "b", transaction: txn({ status: s, paidAt: null }) } }, "es").kind, "pending");
    }
  });
});

describe("withLoadTimeout", () => {
  it("rejects a read that never settles instead of hanging", async () => {
    await assert.rejects(withLoadTimeout(new Promise(() => {}), 10), /timeout/);
  });
  it("passes a settled read through", async () => {
    assert.equal(await withLoadTimeout(Promise.resolve(7), 10), 7);
  });
  it("has a finite default", () => {
    assert.ok(PAYMENT_LOAD_TIMEOUT_MS > 0 && PAYMENT_LOAD_TIMEOUT_MS <= 20000);
  });
});
