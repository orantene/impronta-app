import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type Stripe from "stripe";

import { sendPaymentFailedNotice, type DunningNoticeDeps } from "./dunning-notice";
import { nextPastDueSince } from "./dunning-grace";
import { renderPaymentFailedEmail } from "../email/payment-failed";

// Minimal invoice fixtures (only the fields the dunning path reads).
function invoice(over: Partial<Stripe.Invoice> & { customer_preferred_locales?: string[] }): Stripe.Invoice {
  return {
    id: "in_test_1",
    object: "invoice",
    customer_email: "pat@example.com",
    customer_preferred_locales: ["es-MX"],
    hosted_invoice_url: "https://invoice.stripe.com/i/test_1",
    attempt_count: 1,
    ...over,
  } as unknown as Stripe.Invoice;
}
const failed = invoice({});
const paid = invoice({ status: "paid" } as Partial<Stripe.Invoice>);

function fakeDeps(sendResult: "sent" | "skipped" | "failed" = "sent") {
  const ledger = new Set<string>();
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const deps: DunningNoticeDeps = {
    async claim(row) {
      if (ledger.has(row.invoiceId)) return false;
      ledger.add(row.invoiceId);
      return true;
    },
    async release(id) {
      ledger.delete(id);
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
  fallbackActionUrl: "https://app.test/billing",
});

describe("invoice.payment_failed replay", () => {
  test("delivered twice: same outcome, exactly one email", async () => {
    const { deps, sent } = fakeDeps();
    assert.equal(await sendPaymentFailedNotice(args(failed), deps), "sent");
    assert.equal(await sendPaymentFailedNotice(args(failed), deps), "duplicate");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, "Tu pago no pasó");
    assert.match(sent[0].html, /Actualizar tarjeta/);
    assert.match(sent[0].html, /invoice\.stripe\.com/);
  });

  test("Smart Retry attempt 2 on the same invoice does not resend; a new invoice does", async () => {
    const { deps, sent } = fakeDeps();
    await sendPaymentFailedNotice(args(failed), deps);
    await sendPaymentFailedNotice(args(invoice({ attempt_count: 2 })), deps);
    assert.equal(sent.length, 1);
    await sendPaymentFailedNotice(args(invoice({ id: "in_test_2" })), deps);
    assert.equal(sent.length, 2);
  });

  test("English locale and no-recipient paths", async () => {
    const { deps, sent } = fakeDeps();
    await sendPaymentFailedNotice(args(invoice({ customer_preferred_locales: ["en-US"] })), deps);
    assert.equal(sent[0].subject, "Your payment didn't go through");
    assert.equal(await sendPaymentFailedNotice(args(invoice({ id: "in_x", customer_email: null })), deps), "no_recipient");
  });

  test("a failed send releases the claim so the Stripe retry can resend", async () => {
    const bad = fakeDeps("failed");
    assert.equal(await sendPaymentFailedNotice(args(failed), bad.deps), "failed");
    assert.equal(bad.ledger.size, 0);
    const good = fakeDeps();
    assert.equal(await sendPaymentFailedNotice(args(failed), good.deps), "sent");
  });

  test("subscription side: past_due_since is stable across replays", () => {
    const first = nextPastDueSince("past_due", null, new Date("2026-10-01T00:00:00Z"));
    const replay = nextPastDueSince("past_due", first, new Date("2026-10-03T00:00:00Z"));
    assert.equal(replay, first);
  });
});

describe("invoice.paid replay", () => {
  test("delivered twice: clears past_due_since both times, sends nothing", async () => {
    const { deps, sent } = fakeDeps();
    // invoice.paid never goes through the notice path; the writer clears the clock.
    for (let i = 0; i < 2; i += 1) {
      assert.equal(nextPastDueSince("active", "2026-10-01T00:00:00Z", new Date()), null);
    }
    assert.equal(paid.id, "in_test_1");
    assert.equal(sent.length, 0);
    assert.ok(deps);
  });
});

describe("TUL-835 payment-failed email follows the recipient's app language", () => {
  // An ES talent whose Stripe customer has no preferred_locales got the
  // English subject. The app language (talent_profiles.preferred_locale or the
  // workspace default) now decides, like booking notices.
  const noStripeLocale = () => invoice({ id: "in_loc", customer_preferred_locales: [] });

  test("ES recipient with no Stripe locale: Spanish subject and body", async () => {
    const { deps, sent } = fakeDeps();
    const seen: unknown[] = [];
    deps.recipientLocale = async (q) => {
      seen.push(q);
      return "es";
    };
    assert.equal(await sendPaymentFailedNotice(args(noStripeLocale()), deps), "sent");
    assert.equal(sent[0].subject, "Tu pago no pasó");
    assert.match(sent[0].html, /lang="es"/);
    assert.match(sent[0].html, /No pudimos cobrar tu suscripción/);
    assert.match(sent[0].html, /Actualizar tarjeta/);
    assert.deepEqual(seen, [{ scope: "talent", subscriptionId: "sub_1" }]);
  });

  test("EN recipient: English subject and body, even when Stripe guessed Spanish", async () => {
    const { deps, sent } = fakeDeps();
    deps.recipientLocale = async () => "en";
    await sendPaymentFailedNotice(args(invoice({ id: "in_en", customer_preferred_locales: ["es-MX"] })), deps);
    assert.equal(sent[0].subject, "Your payment didn't go through");
    assert.match(sent[0].html, /We couldn&#39;t charge your/);
    assert.match(sent[0].html, /Update your card/);
  });

  test("no app language: the Stripe customer locale still decides; a lookup error never blocks the email", async () => {
    const { deps, sent } = fakeDeps();
    deps.recipientLocale = async () => null;
    await sendPaymentFailedNotice(args(invoice({ id: "in_a", customer_preferred_locales: ["es-ES"] })), deps);
    assert.equal(sent[0].subject, "Tu pago no pasó");
    deps.recipientLocale = async () => {
      throw new Error("db down");
    };
    assert.equal(await sendPaymentFailedNotice(args(invoice({ id: "in_b", customer_preferred_locales: [] })), deps), "sent");
    assert.equal(sent[1].subject, "Your payment didn't go through");
  });

  test("invariance: the grace days in the email are the policy constant in both languages", async () => {
    for (const loc of ["es", "en"] as const) {
      const { deps, sent } = fakeDeps();
      deps.recipientLocale = async () => loc;
      await sendPaymentFailedNotice(args(noStripeLocale()), deps);
      assert.match(sent[0].html, loc === "es" ? /durante 7 días/ : /for 7 days/);
    }
  });
});

test("email html escapes the action url", () => {
  const html = renderPaymentFailedEmail({ locale: "en", actionUrl: 'https://x.test/?a="b"', graceDays: 7 });
  assert.ok(!html.includes('a="b"'));
  assert.match(html, /Update your card/);
});
