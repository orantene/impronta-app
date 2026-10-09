import "server-only";

/**
 * Cross-custom-domain SSO hand-off (Tenant Registration Engine, S6).
 *
 * Auth cookies are shared across *.tulala.digital / *.lvh.me only; tenant CUSTOM
 * domains are host-only. To let an existing Tulala talent "sign in to apply" on
 * a custom domain — and for Admin Editar on a custom domain (C2) — we mint a
 * single-use, short-TTL nonce on a host where the session is readable, then
 * redeem it on the custom domain to establish a fresh host-only session.
 *
 * The nonce stores ONLY a user_id (no session tokens at rest). Redemption is
 * single-use (atomic used_at claim, replay-safe), TTL-bounded, and bound to the
 * exact verified custom host. The actual session on the custom domain is minted
 * fresh by Supabase (generateLink + verifyOtp) in the redeem route.
 *
 * SECURITY-REVIEW + real-custom-domain QA required before trusting in prod.
 * Design: docs/plans/auth/custom-domain-edit-handoff.md
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  SSO_HANDOFF_TTL_MS,
  mintHandoffExpiresAt,
  normalizeHandoffHost,
  validateHandoffRow,
  type HandoffTokenRow,
} from "@/lib/auth/sso-handoff-pure";

export { SSO_HANDOFF_TTL_MS } from "@/lib/auth/sso-handoff-pure";

/** Is `host` a verified tenant CUSTOM domain (so SSO to it is allowed)? */
export async function isVerifiedCustomHost(host: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("agency_domains")
    .select("hostname, kind, status")
    .eq("hostname", normalizeHandoffHost(host))
    .eq("kind", "custom")
    .in("status", ["active", "verified", "ssl_provisioned"])
    .maybeSingle();
  if (error) {
    logServerError("sso.isVerifiedCustomHost", error);
    return false;
  }
  return Boolean(data);
}

/** Mint a single-use nonce for `userId` bound to `targetHost`. */
export async function mintSsoHandoff(
  userId: string,
  targetHost: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const expiresAt = mintHandoffExpiresAt(Date.now(), SSO_HANDOFF_TTL_MS);
  const { data, error } = await admin
    .from("sso_handoff_tokens")
    .insert({
      user_id: userId,
      target_host: normalizeHandoffHost(targetHost),
      expires_at: expiresAt,
    })
    .select("token")
    .maybeSingle();
  if (error || !data) {
    logServerError("sso.mint", error ?? new Error("no token row"));
    return null;
  }
  return data.token as string;
}

export type RedeemResult = { ok: true; email: string } | { ok: false };

/**
 * Redeem a nonce: validate (unused, unexpired, host matches), atomically claim
 * it (replay-safe), and return the user's email for session minting. The caller
 * (the redeem route) does generateLink + verifyOtp to set the host-only session.
 */
export async function redeemSsoHandoff(
  token: string,
  requestHost: string,
): Promise<RedeemResult> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };
  const host = normalizeHandoffHost(requestHost);

  const { data: row, error } = await admin
    .from("sso_handoff_tokens")
    .select("user_id, target_host, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (error) return { ok: false };

  const checked = validateHandoffRow(
    row as HandoffTokenRow | null,
    host,
    Date.now(),
  );
  if (!checked.ok) return { ok: false };

  // Atomic single-use claim: only the request that flips used_at NULL→now wins.
  const { data: claimed, error: claimError } = await admin
    .from("sso_handoff_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("user_id")
    .maybeSingle();
  if (claimError || !claimed) return { ok: false };

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(
    claimed.user_id as string,
  );
  if (userError || !userData?.user?.email) return { ok: false };
  return { ok: true, email: userData.user.email };
}
