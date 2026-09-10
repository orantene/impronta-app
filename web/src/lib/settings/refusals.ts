/**
 * Every way the two asynchronous settings cards can be told no — as IDS, not
 * sentences.
 *
 * WHY A SEPARATE, PURE MODULE. Two reasons, and the first one is a build
 * error rather than a preference: Next.js requires every export of a
 * `"use server"` file to be an async function, so `pos-modes.ts` and
 * `payment-providers.ts` cannot export these arrays themselves. The second is
 * that the guard which proves each id has a sentence in en, es and fr has to
 * import the list with no Supabase, no `next/cache` and no React in the way.
 *
 * WHY IDS AT ALL. A server action that returns English prose renders English
 * prose to a Spanish or French operator. `requireWorkspaceStaffAction` answers
 * with sentences written for a log ("Not authorized.", "No active tenant for
 * this request."), and both cards used to put that string straight on screen.
 * The action now answers with an id, the card looks the sentence up in the
 * reader's own catalogue, and the original English still reaches whoever is on
 * call through `logServerError`.
 */

/** Refusals `setPosModes` / `getPosModes` can answer with. */
export const POS_MODES_REFUSALS = [
  "not_allowed",
  "unreadable",
  "invalid_request",
  "unknown_mode",
  "mode_not_built",
  "write_failed",
] as const;

export type PosModesRefusal = (typeof POS_MODES_REFUSALS)[number];

/** Refusals `getPaymentProviderStatus` can answer with. */
export const PAYMENT_PROVIDER_REFUSALS = ["not_allowed"] as const;

export type PaymentProviderRefusal = (typeof PAYMENT_PROVIDER_REFUSALS)[number];

/**
 * The one failure that never reaches the server: the action's promise
 * rejected (a dropped connection, a deploy mid-request). It is not a refusal
 * any action can return, so it lives beside them rather than inside either
 * union, and every card that awaits an action needs a sentence for it.
 */
export const CLIENT_LOAD_REFUSAL = "load_failed" as const;

export type ClientLoadRefusal = typeof CLIENT_LOAD_REFUSAL;
