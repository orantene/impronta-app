import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listPointTerminalsPdv,
  mapPointOrderStatus,
  mercadoPagoPointAdapter,
} from "./mercado-pago-collection";

const input = {
  transactionId: "txn_pos_mp_1",
  amountCents: 5000,
  currency: "MXN",
  payerEmail: "walkin@example.com",
  inquiryId: null as string | null,
  bookingId: "bk_1",
  successUrl: "https://app.test/ok",
  cancelUrl: "https://app.test/no",
  method: "terminal" as const,
};

test("Point status map covers the Orders API set", () => {
  assert.equal(mapPointOrderStatus("created"), "pending");
  assert.equal(mapPointOrderStatus("at_terminal"), "pending");
  assert.equal(mapPointOrderStatus("processed"), "succeeded");
  assert.equal(mapPointOrderStatus("failed"), "failed");
  assert.equal(mapPointOrderStatus("expired"), "failed");
  assert.equal(mapPointOrderStatus("canceled"), "cancelled");
  assert.equal(mapPointOrderStatus("refunded"), "refunded");
});

test("without credentials Point stays not landed", async () => {
  const adapter = mercadoPagoPointAdapter({});
  assert.deepEqual(adapter.terminalAvailability(), { available: false, reason: "point_not_landed" });
  const out = await adapter.createPaymentRequest(input);
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, "terminal_unavailable");
});

test("cash is not opened at Mercado Pago", async () => {
  const adapter = mercadoPagoPointAdapter({ accessToken: "APP_USR_test", terminalId: "NEWLAND_N950__SBX0000001" });
  const out = await adapter.createPaymentRequest({ ...input, method: "cash" });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, "cash_is_recorded");
});

test("with credentials create posts a Point order and does not touch Stripe", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: "ORD01", status: "created" }), { status: 200 });
  };
  const adapter = mercadoPagoPointAdapter({
    accessToken: "APP_USR_test",
    terminalId: "NEWLAND_N950__SBX0000001",
    fetchImpl,
  });
  assert.deepEqual(adapter.terminalAvailability(), {
    available: true,
    provider: "mercado_pago_point",
  });
  const out = await adapter.createPaymentRequest(input);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.requestId, "ORD01");
  assert.equal(out.state, "pending");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/orders$/);
  assert.equal(calls[0].init?.headers && (calls[0].init.headers as Record<string, string>)["X-Idempotency-Key"], "mp_txn_pos_mp_1");
});

test("refund stays on the Mercado Pago order, never Stripe", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ status: "refunded" }), { status: 200 });
  const adapter = mercadoPagoPointAdapter({
    accessToken: "APP_USR_test",
    terminalId: "t",
    fetchImpl,
  });
  const out = await adapter.refund("ORD01");
  assert.equal(out.ok, true);
});

test("list terminals keeps only PDV mode", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        terminals: [
          { id: "a", operating_mode: "PDV" },
          { id: "b", operating_mode: "STANDALONE" },
        ],
      }),
      { status: 200 },
    );
  const ids = await listPointTerminalsPdv({ accessToken: "APP_USR_test", fetchImpl });
  assert.deepEqual(ids, ["a"]);
});
