import { IMPERSONATION_COOKIE_NAME } from "@/lib/impersonation/constants";
import { signToken, verifyToken } from "@/lib/crypto/signed-token";

const PAYLOAD_VERSION = 1;
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

export type ParsedImpersonationCookie = {
  targetUserId: string;
  iat: number;
};

export async function signImpersonationCookie(
  secret: string,
  targetUserId: string,
  iat = Date.now(),
): Promise<string> {
  const body = JSON.stringify({
    v: PAYLOAD_VERSION,
    targetUserId,
    iat,
  });
  return signToken(secret, body);
}

export async function parseImpersonationCookie(
  raw: string | undefined,
  secret: string | undefined,
): Promise<
  | { ok: true; data: ParsedImpersonationCookie }
  | { ok: false; reason: string }
> {
  const verified = await verifyToken(raw, secret);
  if (!verified.ok) return { ok: false, reason: verified.reason };

  let parsed: unknown;
  try {
    parsed = JSON.parse(verified.payload);
  } catch {
    return { ok: false, reason: "json" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "shape" };
  const o = parsed as Record<string, unknown>;
  if (o.v !== PAYLOAD_VERSION) return { ok: false, reason: "version" };
  if (typeof o.targetUserId !== "string" || !o.targetUserId.length) {
    return { ok: false, reason: "target" };
  }
  if (typeof o.iat !== "number" || !Number.isFinite(o.iat)) {
    return { ok: false, reason: "iat" };
  }
  if (Date.now() - o.iat > MAX_AGE_MS) return { ok: false, reason: "expired" };

  return { ok: true, data: { targetUserId: o.targetUserId, iat: o.iat } };
}

export function impersonationCookieOptions(): {
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
    maxAge: Math.floor(MAX_AGE_MS / 1000),
  };
}

export function clearImpersonationCookieOnResponse(res: {
  cookies: { set: (name: string, value: string, options: object) => void };
}): void {
  res.cookies.set(IMPERSONATION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
