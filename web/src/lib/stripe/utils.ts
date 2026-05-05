/**
 * lib/stripe/utils.ts
 *
 * Shared helpers used by all three Stripe billing modules:
 *   workspace-billing.ts / talent-billing.ts / client-billing.ts
 *
 * L2+L3: deduplicates `deriveAppBaseUrl` (was 3 identical copies) and
 * `mapStripeStatus` (was 2 identical copies in workspace + talent billing).
 */

import { headers } from "next/headers";

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Derives the application base URL from the incoming Next.js request headers.
 *
 * Rules:
 *  - Production:   use the `host` header with https://
 *  - localhost / 127.0.0.1 / ::1 (IPv6 loopback): use http://
 *  - Any other host: https://
 *
 * Falls back to `http://localhost:3000` when headers() throws (e.g. when
 * called outside a request context in tests).
 */
export async function deriveAppBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const isLocalhost =
      host.startsWith("localhost") ||
      host.startsWith("127.0.0.1") ||
      host === "::1" ||
      host.startsWith("[::1]");
    const proto = isLocalhost ? "http" : "https";
    return `${proto}://${host}`;
  } catch {
    return "http://localhost:3000";
  }
}

// ─── Stripe status mapping ────────────────────────────────────────────────────

export type AllowedStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "paused"
  | "incomplete"
  | "incomplete_expired";

const ALLOWED_STATUSES = new Set<string>([
  "trialing",
  "active",
  "past_due",
  "paused",
  "incomplete",
  "incomplete_expired",
]);

/**
 * Maps a raw Stripe subscription status string to the platform's
 * canonical `AllowedStatus` union.
 *
 * Stripe uses US spelling "canceled"; we store "cancelled" (UK spelling).
 * "unpaid" means Stripe exhausted retry attempts — treat as "past_due" so
 * the plan-downgrade logic fires correctly.
 * Truly unknown statuses default to "incomplete" and emit a console warning
 * so we notice if Stripe ships a new state.
 */
export function mapStripeStatus(stripeStatus: string): AllowedStatus {
  if (ALLOWED_STATUSES.has(stripeStatus)) return stripeStatus as AllowedStatus;
  // Stripe uses "canceled" (US spelling); our DB stores "cancelled" (UK).
  if (stripeStatus === "canceled") return "cancelled";
  // "unpaid" = all retries failed; treat as past_due for downgrade logic.
  if (stripeStatus === "unpaid") return "past_due";
  // eslint-disable-next-line no-console
  console.warn(
    `[stripe] unknown subscription status "${stripeStatus}" — defaulting to 'incomplete'`,
  );
  return "incomplete";
}
