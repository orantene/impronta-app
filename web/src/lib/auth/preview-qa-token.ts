/**
 * Preview-only QA signing tokens.
 *
 * Mints and verifies short-TTL HMAC-SHA256 tokens used by the
 * /api/dev/preview-qa-signin endpoint to let a QA agent authenticate
 * as a fixture user WITHOUT supplying a password.
 *
 * Security model:
 *   - Secret comes from PREVIEW_QA_SIGNING_SECRET env var, which must
 *     exist ONLY in Vercel Preview env vars — never Production.
 *   - Token payload: { email: string; exp: number (unix-seconds) }
 *   - Token format: <b64url(JSON payload)>.<b64url(HMAC-SHA256 sig)>
 *   - Default TTL: 60 seconds (configurable via opts.ttlSeconds)
 *   - Expiry is checked in verifyPreviewQaToken; caller must not bypass.
 */

import { signToken, verifyToken } from "@/lib/crypto/signed-token";

export interface PreviewQaTokenPayload {
  email: string;
  exp: number;
}

export type VerifyOk = { ok: true; email: string };
export type VerifyFail = {
  ok: false;
  reason: "empty" | "no_secret" | "format" | "sig" | "expired" | "invalid_payload";
};
export type VerifyResult = VerifyOk | VerifyFail;

const DEFAULT_TTL_SECONDS = 60;

/**
 * Mint a signed token for the given email.
 * The PREVIEW_QA_SIGNING_SECRET env var must be set; throws if missing.
 */
export async function signPreviewQaToken(
  email: string,
  opts?: { ttlSeconds?: number },
): Promise<string> {
  const secret = process.env.PREVIEW_QA_SIGNING_SECRET;
  if (!secret?.trim()) {
    throw new Error(
      "PREVIEW_QA_SIGNING_SECRET is not set. This env var must exist in Preview environments only.",
    );
  }

  const ttl = opts?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload: PreviewQaTokenPayload = { email, exp };

  return signToken(secret, JSON.stringify(payload));
}

/**
 * Verify a signed token.
 *
 * Returns { ok: true, email } on success.
 * Returns { ok: false, reason } on any failure — callers map to HTTP 401/403.
 */
export async function verifyPreviewQaToken(
  token: string | undefined,
): Promise<VerifyResult> {
  const secret = process.env.PREVIEW_QA_SIGNING_SECRET;

  // Delegate to shared primitive — it handles empty/no_secret/format/sig cases.
  const result = await verifyToken(token, secret);
  if (!result.ok) {
    // Map VerifyFailure reason to our type (same union members for the overlapping cases).
    return result as VerifyFail;
  }

  // Parse and validate the payload.
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.payload);
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).email !== "string" ||
    typeof (parsed as Record<string, unknown>).exp !== "number"
  ) {
    return { ok: false, reason: "invalid_payload" };
  }

  const { email, exp } = parsed as PreviewQaTokenPayload;

  if (Math.floor(Date.now() / 1000) > exp) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, email };
}
