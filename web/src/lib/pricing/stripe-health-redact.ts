/**
 * Server-side redaction of the Commerce health payload (P0). Runs before the
 * payload reaches any client component: webhook endpoint URLs lose their query
 * (x-vercel-protection-bypass) and every free-text detail has key fragments
 * (sk_/rk_/pk_/whsec_) masked to the last 4 chars.
 */
import type { StripeHealth } from "./stripe-health";
import { redactUrlForDisplay, scrubSecretsInText } from "@/lib/security/redact-display";

export function redactStripeHealth(h: StripeHealth): StripeHealth {
  return {
    ...h,
    checks: h.checks.map((c) => ({
      ...c,
      detail: scrubSecretsInText(c.detail),
      items: c.items?.map((it) => ({
        ...it,
        name: /^https?:\/\//i.test(it.name) ? redactUrlForDisplay(it.name) : scrubSecretsInText(it.name),
        detail: scrubSecretsInText(it.detail),
      })),
    })),
  };
}
