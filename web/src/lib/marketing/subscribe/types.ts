/**
 * Shared types for the marketing newsletter capture flow (Wave 2).
 *
 * Split into its own module (no "use server") so the client capture module can
 * import the result type without pulling the server action's server-only
 * dependencies into the client bundle.
 */

/** Locales the newsletter ships copy for. */
export type SubscribeLocale = "en" | "es";

/**
 * Outcome of a subscribe attempt, rendered directly by the capture module.
 *  - `ok`           — new row written (or honeypot tripped; indistinguishable to a bot).
 *  - `already`      — email was already on the list.
 *  - `invalid`      — email failed validation.
 *  - `rate_limited` — too many attempts from this client; try later.
 *  - `error`        — unexpected server error (email service down, DB unreachable).
 */
export type SubscribeStatus =
  | "ok"
  | "already"
  | "invalid"
  | "rate_limited"
  | "error";

export type SubscribeResult = { status: SubscribeStatus };

/** Input contract the client module posts to the subscribe server action. */
export type SubscribeInput = {
  email: string;
  /** Which surface the signup came from (analytics + audience segmentation). */
  source: string;
  /** UI locale; validated + narrowed to SubscribeLocale server-side. */
  locale: string;
  /**
   * Honeypot. A real user never fills this (it is visually hidden + aria-hidden);
   * a naive bot that fills every field trips it and gets a silent no-op `ok`.
   */
  company?: string;
};
