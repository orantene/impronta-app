import { signToken, verifyToken } from "@/lib/crypto/signed-token";

/**
 * Personal promo link token (L4). Opaque, signed, no PII: the payload is the
 * promo id with a version prefix, nothing about the client. Signed with the
 * existing HMAC secret the guest cookie uses; without it no token can be
 * minted or accepted (a personal link then simply does not unlock).
 */
export const PROMO_LINK_SECRET_ENV = "GUEST_COOKIE_SECRET";

export function promoLinkSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const s = env[PROMO_LINK_SECRET_ENV];
  return s && s.length > 0 ? s : undefined;
}

export async function signPersonalToken(secret: string, promoId: string): Promise<string> {
  return signToken(secret, `pl1:${promoId}`);
}

export async function verifyPersonalToken(
  raw: string | null | undefined,
  secret: string | undefined,
  promoId: string,
): Promise<boolean> {
  if (!raw) return false;
  const v = await verifyToken(raw, secret);
  return v.ok && v.payload === `pl1:${promoId}`;
}
