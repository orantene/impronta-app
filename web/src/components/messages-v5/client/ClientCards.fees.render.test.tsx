import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { readPayment } from "@/lib/messages-v5/client-thread-view";

import { ClientPaymentCard } from "./ClientCards";
import { EN_CLIENT, EN_KIT, ES_CLIENT } from "./test-copy";

const now = new Date("2026-09-17T10:00:00.000Z");
const base = { copy: EN_CLIENT, kit: EN_KIT, business: "Impronta", locale: "en" };

const feeLines = [
  { code: "service_subtotal", cents: 10000 },
  { code: "platform_fee", cents: 150 },
  { code: "processing_fee", cents: 330 },
  { code: "total_charged", cents: 10480 },
];
const payload = { paymentLinkCode: "abc", amountCents: 10480, amountKind: "full", currency: "USD", state: "sent", feeLines };

test("payment: fee lines render on an open request in en and es", () => {
  const en = renderToStaticMarkup(<ClientPaymentCard {...base} now={now} view={readPayment(payload)} onPay={() => {}} />);
  assert.match(en, /Service/);
  assert.match(en, /Platform fee/);
  assert.match(en, /Card processing/);
  assert.match(en, /Fees are non-refundable\./);
  assert.match(en, /\$104\.80/);
  const es = renderToStaticMarkup(<ClientPaymentCard {...base} copy={ES_CLIENT} locale="es" now={now} view={readPayment(payload)} onPay={() => {}} />);
  assert.match(es, /Procesamiento de tarjeta/);
  assert.match(es, /no son reembolsables/);
});

test("payment: fee lines are omitted when they do not sum to the charge, and once paid", () => {
  const wrong = renderToStaticMarkup(<ClientPaymentCard {...base} now={now} view={readPayment({ ...payload, amountCents: 5000 })} onPay={() => {}} />);
  assert.doesNotMatch(wrong, /Fees are non-refundable/);
  const paid = renderToStaticMarkup(<ClientPaymentCard {...base} now={now} view={readPayment({ ...payload, state: "paid" })} />);
  assert.doesNotMatch(paid, /Fees are non-refundable/);
  const none = renderToStaticMarkup(<ClientPaymentCard {...base} now={now} view={readPayment({ ...payload, feeLines: undefined })} onPay={() => {}} />);
  assert.doesNotMatch(none, /Fees are non-refundable/);
});
