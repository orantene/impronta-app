import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type Stripe from "stripe";

import { receiptNoticeKey, sendPaymentReceiptNotice, type ReceiptNoticeDeps } from "./receipt-notice";
import { renderPaymentReceiptEmail } from "../email/payment-receipt";

function invoice(over: Record<string, unknown> = {}): Stripe.Invoice {
  return {
    id: "in_paid_1",
    object: "invoice",
    status: "paid",
    customer_email: "pat@example.com",
    customer_preferred_locales: ["es-MX"],
    hosted_invoice_url: "https://invoice.stripe.com/i/paid_1",
    invoice_pdf: "https://pay.stripe.com/invoice/paid_1/pdf",
    number: "ABC-0001",
    amount_paid: 1900,
    currency: "usd",
    ...over,
  } as unknown as Stripe.Invoice;
}

function fakeDeps(sendResult: "sent" | "skipped" | "failed" = "sent") {
  const ledger = new Set<string>();
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const deps: ReceiptNoticeDeps = {
    async claim(row) {
      if (ledger.has(row.key)) return false;
      ledger.add(row.key);
      return true;
    },
    async release(key) {
      ledger.delete(key);
    },
    async send(input) {
      if (sendResult !== "failed") sent.push(input);
      return sendResult;
    },
  };
  return { deps, sent, ledger };
}

const args = (inv: Stripe.Invoice) => ({
  invoice: inv,
  scope: "talent" as const,
  subscriptionId: "sub_1",
});

describe("receipt email per paid subscription invoice", () => {
  test("webhook replay: same outcome, exactly one email, keyed on the invoice id", async () => {
    const { deps, sent, ledger } = fakeDeps();
    assert.equal(await sendPaymentReceiptNotice(args(invoice()), deps), "sent");
    assert.equal(await sendPaymentReceiptNotice(args(invoice()), deps), "duplicate");
    assert.equal(sent.length, 1);
    assert.deepEqual([...ledger], [receiptNoticeKey("in_paid_1")]);
    assert.match(sent[0].html, /19\.00/);
    assert.match(sent[0].html, /invoice\.stripe\.com/);
  });

  test("a different invoice sends its own receipt", async () => {
    const { deps, sent } = fakeDeps();
    await sendPaymentReceiptNotice(args(invoice()), deps);
    await sendPaymentReceiptNotice(args(invoice({ id: "in_paid_2" })), deps);
    assert.equal(sent.length, 2);
  });

  test("zero-amount invoices (trial start, 100% promo) send nothing and claim nothing", async () => {
    const { deps, sent, ledger } = fakeDeps();
    assert.equal(await sendPaymentReceiptNotice(args(invoice({ amount_paid: 0 })), deps), "not_charged");
    assert.equal(sent.length, 0);
    assert.equal(ledger.size, 0);
  });

  test("an invoice that is not paid never gets a receipt (fail closed)", async () => {
    const { deps, sent } = fakeDeps();
    assert.equal(await sendPaymentReceiptNotice(args(invoice({ status: "open" })), deps), "not_charged");
    assert.equal(sent.length, 0);
  });

  test("no recipient: no claim, no send", async () => {
    const { deps, ledger } = fakeDeps();
    assert.equal(await sendPaymentReceiptNotice(args(invoice({ customer_email: null })), deps), "no_recipient");
    assert.equal(ledger.size, 0);
  });

  test("failed send releases the claim so Stripe's retry can send once", async () => {
    const bad = fakeDeps("failed");
    assert.equal(await sendPaymentReceiptNotice(args(invoice()), bad.deps), "failed");
    assert.equal(bad.ledger.size, 0);
  });

  test("recipient locale wins over the Stripe locale; English by default", async () => {
    const { deps, sent } = fakeDeps();
    deps.recipientLocale = async () => "en";
    await sendPaymentReceiptNotice(args(invoice()), deps);
    assert.equal(sent[0].subject, "Your payment receipt");
    const other = fakeDeps();
    await sendPaymentReceiptNotice(args(invoice({ customer_preferred_locales: undefined, id: "in_x" })), other.deps);
    assert.equal(other.sent[0].subject, "Your payment receipt");
    const es = fakeDeps();
    await sendPaymentReceiptNotice(args(invoice({ id: "in_y" })), es.deps);
    assert.equal(es.sent[0].subject, "Tu recibo de pago");
  });
});

describe("receipt email render", () => {
  test("escapes the invoice number and shows the formatted amount in ES", () => {
    const html = renderPaymentReceiptEmail({
      locale: "es",
      amountCents: 1900,
      currency: "usd",
      invoiceNumber: "<b>1</b>",
      viewUrl: "https://invoice.stripe.com/i/x",
      pdfUrl: null,
    });
    assert.doesNotMatch(html, /<b>1<\/b>/);
    assert.match(html, /Gracias/);
  });
});
