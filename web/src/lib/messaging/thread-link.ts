/**
 * thread-link.ts — building a customer's `/c/t/<token>` link on the CLIENT.
 *
 * Deliberately separate from `thread-token.ts` (which signs and verifies the
 * token with `node:crypto`, server-only in effect though not marked so).
 * `MessagesShell` is a client component; importing a module whose top-level
 * imports include `node:crypto` into client code is a bundling hazard even
 * when the function it wants is a plain string template. This file has no
 * imports at all, so it is safe on either side.
 */

/** Null in, null out — a server with no `GUEST_COOKIE_SECRET` mints no token. */
export function customerThreadUrl(origin: string, token: string | null): string | null {
  if (!token) return null;
  return `${origin}/c/t/${encodeURIComponent(token)}`;
}
