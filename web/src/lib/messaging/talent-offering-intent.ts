import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A signed choice of one talent service, its option, and its extras.
 *
 * The token carries ids and an intent. It does not carry a tenant id or a
 * price. Verification only checks the signature and the expiry. The seed
 * reloads the offering from the database and refuses a profile or a tenant
 * that does not own it.
 */

const VERSION = "v1";
const SEPARATOR = ".";
const PURPOSE = "talent-offering";
const TTL_MS = 30 * 60 * 1000;

export type TalentOfferingIntentKind = "ask" | "reserve";

export type TalentOfferingIntentPayload = {
  p: typeof PURPOSE;
  profile: string;
  offering: string;
  variant: string | null;
  addons: string[];
  intent: TalentOfferingIntentKind;
  iat: number;
  exp: number;
};

function secret(): string | null {
  const value = process.env.GUEST_COOKIE_SECRET;
  return value && value.length > 0 ? value : null;
}

function signEncoded(encoded: string, key: string): string {
  return createHmac("sha256", key).update(`${PURPOSE}:${VERSION}:${encoded}`).digest("base64url");
}

export function signTalentOfferingIntent(
  input: {
    profileId: string;
    offeringId: string;
    variantId?: string | null;
    addonIds?: readonly string[];
    intent: TalentOfferingIntentKind;
  },
  nowMs = Date.now(),
): string | null {
  const key = secret();
  if (!key || !input.profileId || !input.offeringId) return null;
  const payload: TalentOfferingIntentPayload = {
    p: PURPOSE,
    profile: input.profileId,
    offering: input.offeringId,
    variant: input.variantId ?? null,
    addons: [...new Set((input.addonIds ?? []).filter((id) => typeof id === "string" && id.length > 0))],
    intent: input.intent,
    iat: nowMs,
    exp: nowMs + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${VERSION}${SEPARATOR}${encoded}${SEPARATOR}${signEncoded(encoded, key)}`;
}

export type VerifyTalentOfferingIntentResult =
  | { ok: true; payload: TalentOfferingIntentPayload }
  | { ok: false; reason: "no_secret" | "malformed" | "bad_signature" | "expired" };

export function verifyTalentOfferingIntent(token: string, nowMs = Date.now()): VerifyTalentOfferingIntentResult {
  const key = secret();
  if (!key) return { ok: false, reason: "no_secret" };
  const parts = token.split(SEPARATOR);
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: "malformed" };
  const [, encoded, sig] = parts;
  const expected = signEncoded(encoded, key);
  const left = Buffer.from(sig, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false, reason: "bad_signature" };
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TalentOfferingIntentPayload;
    if (payload.p !== PURPOSE || !payload.profile || !payload.offering) return { ok: false, reason: "malformed" };
    if (payload.intent !== "ask" && payload.intent !== "reserve") return { ok: false, reason: "malformed" };
    if (!Array.isArray(payload.addons)) return { ok: false, reason: "malformed" };
    if (nowMs > payload.exp) return { ok: false, reason: "expired" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
