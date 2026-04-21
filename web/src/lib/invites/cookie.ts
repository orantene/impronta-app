/**
 * Invite-link cookie (Phase 5/6 M5).
 *
 * When a visitor hits `/invite/[token]`, we don't always have a session to
 * redeem against yet — they may need to sign up, sign in, or finish
 * onboarding first. We stash the verified invite payload in an HttpOnly
 * cookie so the next authenticated surface can pick it up and convert.
 *
 * The cookie holds the raw (already-verified) payload JSON. It is set
 * only after `parseInviteToken` has validated the signature + expiry, so
 * downstream readers can trust the content without re-verifying.
 *
 * We keep a short TTL (10 minutes) because the value reflects a hot
 * hand-off, not a long-lived identity. After that the visitor can click
 * the original link again — tokens themselves last longer (default 14d).
 */

import type { InvitePayload } from "@/lib/invites/token";

export const INVITE_COOKIE_NAME = "impronta_invite";
const COOKIE_MAX_AGE_SECONDS = 10 * 60;

type CookieWriter = {
  cookies: { set: (name: string, value: string, options: object) => void };
};

type CookieStore = {
  get: (name: string) => { value: string } | undefined;
};

export function serializeInviteCookieValue(payload: InvitePayload): string {
  return JSON.stringify({
    v: 1,
    t: payload.inviterTenantId,
    by: payload.inviterUserId,
    i: payload.intent,
    exp: payload.expiresAt,
  });
}

export function parseInviteCookieValue(
  raw: string | undefined,
): InvitePayload | null {
  if (!raw?.length) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.t !== "string" || !o.t.length) return null;
  if (typeof o.by !== "string" || !o.by.length) return null;
  if (o.i !== "represent") return null;
  if (typeof o.exp !== "number" || !Number.isFinite(o.exp)) return null;
  if (Date.now() > o.exp) return null;
  return {
    inviterTenantId: o.t,
    inviterUserId: o.by,
    intent: "represent",
    expiresAt: o.exp,
  };
}

export function inviteCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

export function setInviteCookieOnResponse(
  res: CookieWriter,
  payload: InvitePayload,
): void {
  res.cookies.set(
    INVITE_COOKIE_NAME,
    serializeInviteCookieValue(payload),
    inviteCookieOptions(),
  );
}

export function clearInviteCookieOnResponse(res: CookieWriter): void {
  res.cookies.set(INVITE_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function readInviteFromCookieStore(store: CookieStore): InvitePayload | null {
  return parseInviteCookieValue(store.get(INVITE_COOKIE_NAME)?.value);
}
