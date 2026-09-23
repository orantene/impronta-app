/**
 * thread-link.ts — building a client's `/c/t/<token>` link.
 *
 * Deliberately separate from `thread-token.ts` (which signs and verifies the
 * token with `node:crypto`, server-only in effect though not marked so).
 * `MessagesShell` is a client component; importing a module whose top-level
 * imports include `node:crypto` into client code is a bundling hazard even
 * when the function it wants is a plain string template. This file imports
 * only the brand host constant, so it is safe on either side.
 */
import { TULALA_APEX_HOST } from "@/lib/brand/tulala";

/** The platform hub. `/c/t` 404s on a talent vanity host, so those links land here. */
export const HUB_THREAD_ORIGIN = `https://${TULALA_APEX_HOST}`;

/** Null in, null out — a server with no `GUEST_COOKIE_SECRET` mints no token. */
export function customerThreadUrl(origin: string, token: string | null): string | null {
  if (!token) return null;
  const base = origin.replace(/\/$/, "");
  return `${base}/c/t/${encodeURIComponent(token)}`;
}

export function conversationHostKind(sourceContext: unknown): string | null {
  let value = sourceContext;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const kind = (value as { host_kind?: unknown }).host_kind;
  return typeof kind === "string" && kind.trim() ? kind.trim() : null;
}

/**
 * Talent-site conversations get a hub-absolute link. Every other host keeps
 * the request origin, which is what Copy link already produced.
 */
export function threadLinkUrl(input: {
  token: string | null;
  requestOrigin: string;
  conversationHostKind: string | null;
  hubOrigin?: string;
}): string | null {
  if (!input.token) return null;
  if (input.conversationHostKind === "talent_site") {
    return customerThreadUrl(input.hubOrigin ?? HUB_THREAD_ORIGIN, input.token);
  }
  if (!input.requestOrigin.trim()) return null;
  return customerThreadUrl(input.requestOrigin, input.token);
}
