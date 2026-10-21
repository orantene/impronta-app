/**
 * TUL-1737: was a failed Stripe write DEFINITELY not applied, or might Stripe still have applied it?
 *
 * DEFINITE (Stripe answered and refused; the request had no effect): StripeInvalidRequestError, StripeAuthenticationError,
 * StripePermissionError, StripeRateLimitError, StripeCardError, StripeIdempotencyError.
 * AMBIGUOUS (the request may have landed): StripeConnectionError (timeout / network drop), StripeAPIError (5xx), and any
 * error that is not a recognisable Stripe error. Callers only compensate (clear saved state) on a DEFINITE failure.
 */
const DEFINITE_TYPES = new Set([
  "StripeInvalidRequestError",
  "StripeAuthenticationError",
  "StripePermissionError",
  "StripeRateLimitError",
  "StripeCardError",
  "StripeIdempotencyError",
]);

export function isDefiniteStripeFailure(err: unknown): boolean {
  const type = typeof err === "object" && err !== null ? (err as { type?: unknown }).type : undefined;
  return typeof type === "string" && DEFINITE_TYPES.has(type);
}
