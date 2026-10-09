/**
 * What the pay page shows when opening the checkout did not return a Stripe URL.
 *
 * "unknown" ("Payment status is unknown. Do not pay again") is only honest when Stripe MAY have taken money. When
 * the start definitely failed before any session existed (paid run 2026-10-09: our lane guard refused the charge),
 * telling the client not to pay again is wrong: nothing happened and they should simply retry.
 */
export type PayStartFailureReason = "not_found" | "expired" | "not_open" | "provider_unavailable" | "unavailable" | "start_failed" | "currency_mismatch";
export type PayStartViewStatus = "expired" | "startFailed" | "unknown";

export function payStartViewStatus(reason: PayStartFailureReason): PayStartViewStatus {
  if (reason === "expired") return "expired";
  if (reason === "start_failed") return "startFailed";
  return "unknown";
}
