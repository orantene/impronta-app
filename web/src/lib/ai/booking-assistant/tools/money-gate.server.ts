import "server-only";

import { mockPaymentsAllowed } from "@/lib/payments/links";

/**
 * TUL-36 slice 5 [MONEY]: the gate in front of the assistant's order + pay-link executor.
 *
 * DEFAULT OFF. The path opens only when ALL hold:
 *  - `AI_ASSISTANT_PAYLINK_ENABLED` is exactly "1";
 *  - the payment provider is a TEST one: a Stripe key starting `sk_test_`, or, with no Stripe key,
 *    the mock provider where mock money is allowed (never the production deployment).
 * A live key (anything else) refuses until the owner lifts this on purpose with a code change.
 */
export const ASSISTANT_PAYLINK_FLAG = "AI_ASSISTANT_PAYLINK_ENABLED";

export type AssistantMoneyGate =
  | { ok: true; provider: "stripe_test" | "mock" }
  | { ok: false; reason: "flag_off" | "live_key" | "no_provider" };

export function assistantMoneyGate(env: Readonly<Record<string, string | undefined>> = process.env): AssistantMoneyGate {
  if (env[ASSISTANT_PAYLINK_FLAG] !== "1") return { ok: false, reason: "flag_off" };
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (key) return key.startsWith("sk_test_") ? { ok: true, provider: "stripe_test" } : { ok: false, reason: "live_key" };
  return mockPaymentsAllowed(env) ? { ok: true, provider: "mock" } : { ok: false, reason: "no_provider" };
}
