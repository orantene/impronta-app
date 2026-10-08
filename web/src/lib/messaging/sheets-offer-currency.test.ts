/**
 * TUL-281 follow-up: the loaders behind the messages-v5 sheets carry the
 * record's own currency, so the view-models can show "$850 MXN".
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { confirmSourceOptions } from "@/lib/messages-v5/confirm-view";
import { formatRecordMoney } from "@/lib/messages-v5/record-money";
import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { loadRefundableTransaction } from "./money";
import { loadInquiryOffers } from "./sheets";

const TENANT = uuid(1);
const INQUIRY = uuid(2);
const ORDER = uuid(3);

function offer(id: string, currency: string | null, status = "accepted") {
  return {
    id,
    tenant_id: TENANT,
    inquiry_id: INQUIRY,
    status,
    version: 1,
    total_client_price: 850,
    updated_at: "2026-10-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    deposit_pct: 30,
    deposit_amount_cents: null,
    currency_code: currency,
  };
}

test("loadInquiryOffers: an MXN offer's view-model carries 'MXN' and the display reads '$850 MXN'", async () => {
  const { admin } = fakeAdmin({ inquiry_offers: [offer("o-mxn", "MXN")] });
  const [row] = await loadInquiryOffers(admin as never, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(row.currencyCode, "MXN");
  assert.equal(formatRecordMoney(Math.round(row.totalClientPrice * 100), row.currencyCode), "$850 MXN");
});

test("loadInquiryOffers: a USD offer carries 'USD'; a null or junk currency falls back to the platform currency", async () => {
  const { admin } = fakeAdmin({ inquiry_offers: [offer("o-usd", "USD"), offer("o-null", null), offer("o-junk", "pesos")] });
  const rows = await loadInquiryOffers(admin as never, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.deepEqual(rows.map((r) => [r.id, r.currencyCode]).sort(), [["o-junk", "USD"], ["o-null", "USD"], ["o-usd", "USD"]]);
});

test("confirmSourceOptions: the accepted MXN offer's option carries 'MXN' through to the sheet", async () => {
  const { admin } = fakeAdmin({ inquiry_offers: [offer("o-mxn", "MXN")] });
  const offers = await loadInquiryOffers(admin as never, { tenantId: TENANT, inquiryId: INQUIRY });
  const [opt] = confirmSourceOptions([], offers);
  assert.equal(opt.currencyCode, "MXN");
  assert.equal(formatRecordMoney(opt.totalCents ?? 0, opt.currencyCode), "$850 MXN");
});

test("loadRefundableTransaction: the refundable payment carries the order's own currency", async () => {
  const seed = (currency: string | null) =>
    fakeAdmin({
      orders: [{ id: ORDER, tenant_id: TENANT, currency }],
      order_lines: [],
      booking_transactions: [{ id: uuid(9), order_id: ORDER, status: "paid", gross_amount_cents: 85000, created_at: "2026-10-01T00:00:00Z" }],
    }).admin;
  const mxn = await loadRefundableTransaction(seed("MXN") as never, { tenantId: TENANT, recordKind: "order", recordId: ORDER });
  assert.equal(mxn?.currencyCode, "MXN");
  assert.equal(mxn?.refundableCents, 85000);
  assert.equal(formatRecordMoney(mxn?.refundableCents ?? 0, mxn?.currencyCode), "$850 MXN");
  const unknown = await loadRefundableTransaction(seed(null) as never, { tenantId: TENANT, recordKind: "order", recordId: ORDER });
  assert.equal(unknown?.currencyCode, null);
  assert.equal(formatRecordMoney(unknown?.refundableCents ?? 0, unknown?.currencyCode), "$850 USD");
});
