/**
 * Client-safe attention token for payments that settled after cancellation.
 *
 * Kept free of `server-only` / notification producers so agenda loaders that
 * only compare metadata can import this without pulling the dispatcher graph
 * into Client Component bundles (TUL-391 / #2959 Vercel break).
 */

export const PAID_AFTER_CANCEL_ATTENTION = "paid_after_cancellation" as const;
