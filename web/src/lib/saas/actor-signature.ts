/**
 * HMAC over the verified-actor headers (TUL-1269).
 *
 * Stripping inbound copies is not enough on its own: a path the proxy matcher skips (e.g.
 * `/acme/admin/x.png`, which still reaches the admin `[...missing]` page) never runs the proxy, so a
 * forged `x-impronta-actor-*` set arrives untouched. The proxy therefore also writes
 * `x-impronta-actor-sig` = HMAC-SHA256(ACTOR_HEADER_SECRET, fields), and the reader trusts the
 * headers only when the signature verifies. No signature, bad signature or no secret = not trusted.
 *
 * Web Crypto only, so it runs in the Edge proxy and in Node server components alike.
 *
 * ACTOR_HEADER_SECRET: any long random string, the same value for every instance of one
 * deployment (set it in Vercel env; `openssl rand -hex 32`). Unset means the fast path is OFF and
 * every request re-resolves the user (slower, never wrong). Only NODE_ENV=development falls back to
 * a fixed local constant, so `npm run dev` keeps the fast path without configuration.
 */

import { ACTOR_SIG_HEADER_NAME } from "@/lib/saas/actor-headers";

export const ACTOR_SIG_HEADER = ACTOR_SIG_HEADER_NAME;

export type ActorFields = {
  id: string;
  email: string | null;
  appRole: string | null;
  status: string | null;
  onboarded: string | null;
  homePref: string | null;
};

const DEV_FALLBACK_SECRET = "impronta-dev-only-actor-secret";

export function actorSecret(env: { ACTOR_HEADER_SECRET?: string; NODE_ENV?: string }): string | null {
  const s = env.ACTOR_HEADER_SECRET?.trim();
  if (s) return s;
  return env.NODE_ENV === "development" ? DEV_FALLBACK_SECRET : null;
}

function payload(f: ActorFields): string {
  // JSON array: no delimiter-injection ambiguity between fields.
  return JSON.stringify([f.id, f.email ?? "", f.appRole ?? "", f.status ?? "", f.onboarded ?? "", f.homePref ?? ""]);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signActorFields(secret: string, fields: ActorFields): Promise<string> {
  return hmacHex(secret, payload(fields));
}

/** Constant-time over equal-length hex strings; false on any length mismatch. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyActorSignature(
  secret: string | null,
  fields: ActorFields,
  presented: string | null,
): Promise<boolean> {
  if (!secret || !presented) return false;
  return timingSafeEqualHex(await signActorFields(secret, fields), presented);
}
