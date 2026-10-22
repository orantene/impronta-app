/**
 * TUL-1376: rent billing starts in Stripe TEST mode only. Two conditions, both required:
 * the flag is on, AND the Stripe secret key is a test key. A live key (or a missing one) refuses
 * everything, so the first real charge is a separate, deliberate change.
 */
import { stripeEnv } from "@/lib/stripe/env-keys";

export type RentGate = { ok: true } | { ok: false; reason: "disabled" | "not_test_mode" };

export function rentBillingGate(env: Record<string, string | undefined> = process.env): RentGate {
  if (env.RENT_BILLING_ENABLED !== "1") return { ok: false, reason: "disabled" };
  // The key the app will really charge with: on forced-test hosts (staging/preview) that is the *_TEST sibling.
  const key = (stripeEnv("STRIPE_SECRET_KEY", env) ?? "").trim();
  if (!key.startsWith("sk_test_")) return { ok: false, reason: "not_test_mode" };
  return { ok: true };
}
