/**
 * Invite-link token (Phase 5/6 M5).
 *
 * Opaque HMAC-signed token that identifies the inviter tenant and intent.
 * Used to build `/invite/[token]` links that carry the inviter context
 * through sign-up or sign-in and convert to a representation request on
 * the first post-auth redemption pass.
 *
 * The token format and crypto primitives are shared with the super-admin
 * impersonation cookie via `@/lib/crypto/signed-token` — both modules
 * layer their own versioned JSON payload on top of the same verified
 * envelope, so rotating `INVITE_TOKEN_HMAC_SECRET` invalidates invites
 * without touching impersonation.
 *
 * Payload shape (v1):
 *   { v: 1, t: <inviterTenantId>, by: <inviterUserId>, i: "represent",
 *     exp: <unix ms> }
 *
 * The caller (e.g. an agency admin generating a link) chooses the expiry.
 * Default is 14 days — long enough for a talent to sign up from a DM,
 * short enough that stale links can't be redeemed after a rep changes.
 */

import { signToken, verifyToken } from "@/lib/crypto/signed-token";

const PAYLOAD_VERSION = 1;
export const DEFAULT_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type InviteIntent = "represent";

export type InvitePayload = {
  inviterTenantId: string;
  inviterUserId: string;
  intent: InviteIntent;
  expiresAt: number;
};

export type InviteCreateInput = {
  inviterTenantId: string;
  inviterUserId: string;
  intent?: InviteIntent;
  ttlMs?: number;
};

export async function createInviteToken(
  secret: string,
  input: InviteCreateInput,
): Promise<{ token: string; payload: InvitePayload }> {
  if (!secret?.length) throw new Error("invite: missing secret");
  const intent: InviteIntent = input.intent ?? "represent";
  const ttl = input.ttlMs ?? DEFAULT_INVITE_TTL_MS;
  const payload: InvitePayload = {
    inviterTenantId: input.inviterTenantId,
    inviterUserId: input.inviterUserId,
    intent,
    expiresAt: Date.now() + ttl,
  };
  const body = JSON.stringify({
    v: PAYLOAD_VERSION,
    t: payload.inviterTenantId,
    by: payload.inviterUserId,
    i: payload.intent,
    exp: payload.expiresAt,
  });
  const token = await signToken(secret, body);
  return { token, payload };
}

export type VerifiedInvite =
  | { ok: true; payload: InvitePayload }
  | {
      ok: false;
      reason:
        | "empty"
        | "no_secret"
        | "format"
        | "sig"
        | "json"
        | "shape"
        | "version"
        | "intent"
        | "expired";
    };

export async function parseInviteToken(
  raw: string | undefined,
  secret: string | undefined,
): Promise<VerifiedInvite> {
  const verified = await verifyToken(raw, secret);
  if (!verified.ok) return { ok: false, reason: verified.reason };

  let parsed: unknown;
  try {
    parsed = JSON.parse(verified.payload);
  } catch {
    return { ok: false, reason: "json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "shape" };
  }
  const o = parsed as Record<string, unknown>;
  if (o.v !== PAYLOAD_VERSION) return { ok: false, reason: "version" };
  if (typeof o.t !== "string" || !o.t.length) {
    return { ok: false, reason: "shape" };
  }
  if (typeof o.by !== "string" || !o.by.length) {
    return { ok: false, reason: "shape" };
  }
  if (o.i !== "represent") return { ok: false, reason: "intent" };
  if (typeof o.exp !== "number" || !Number.isFinite(o.exp)) {
    return { ok: false, reason: "shape" };
  }
  if (Date.now() > o.exp) return { ok: false, reason: "expired" };

  return {
    ok: true,
    payload: {
      inviterTenantId: o.t,
      inviterUserId: o.by,
      intent: o.i,
      expiresAt: o.exp,
    },
  };
}
