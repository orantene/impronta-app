/**
 * Mock payments are a dev/test convenience only. In production a missing
 * Stripe key must fail loudly, never show a buyer a fake "paid" page.
 * PAYMENTS_MOCK=1 is the explicit opt-in (e.g. a production-mode QA build).
 */
export function paymentsMockAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PAYMENTS_MOCK === "1";
}
