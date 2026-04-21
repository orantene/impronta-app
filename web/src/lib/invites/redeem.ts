/**
 * Invite redemption (Phase 5/6 M5).
 *
 * Converts a stored `impronta_invite` cookie into a
 * `talent_representation_requests` row targeting the inviter tenant. Runs
 * after authentication (e.g. in `/auth/callback`) and after post-onboarding
 * redirects — any surface that has a reliable session can call this.
 *
 * Behavior:
 *   - No cookie → no-op, returns `skipped:"no_cookie"`.
 *   - No session → no-op (we can't redeem without an actor).
 *   - No talent profile for the current user → no-op, leaves the cookie in
 *     place so a later post-onboarding pass can redeem it.
 *   - Request already exists → treated as success (idempotent, clears cookie).
 *   - submitRepresentationRequest fails → error surfaced, cookie NOT cleared
 *     (so the inviter can retry) unless the failure is a known-stable one
 *     like "unknown target tenant", in which case we clear to stop looping.
 *
 * This module never throws. Callers should propagate `{ ok, reason? }`
 * into analytics / UI copy rather than relying on exceptions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { HUB_AGENCY_ID } from "@/lib/saas";
import { submitRepresentationRequest } from "@/lib/saas/representation-requests";
import type { InvitePayload } from "@/lib/invites/token";
import {
  clearInviteCookieOnResponse,
  readInviteFromCookieStore,
} from "@/lib/invites/cookie";

type CookieStore = {
  get: (name: string) => { value: string } | undefined;
};

type CookieWriter = {
  cookies: { set: (name: string, value: string, options: object) => void };
};

export type RedemptionResult =
  | { ok: true; outcome: "converted" | "already_open"; inviterTenantId: string }
  | {
      ok: false;
      reason:
        | "no_cookie"
        | "no_session"
        | "no_profile"
        | "invalid_tenant"
        | "submit_failed";
      message?: string;
    };

async function resolveInviterTargetType(
  supabase: SupabaseClient,
  inviterTenantId: string,
): Promise<"agency" | "hub" | null> {
  // Hub is the single reserved UUID; every other agencies row is an agency
  // tenant. We intentionally don't read `agencies.kind` here because that
  // column only exists after the P5/6 M0 migration — this function must
  // work pre- and post-M0.
  if (inviterTenantId === HUB_AGENCY_ID) return "hub";
  const { data, error } = await supabase
    .from("agencies")
    .select("id")
    .eq("id", inviterTenantId)
    .maybeSingle();
  if (error || !data) return null;
  return "agency";
}

async function resolveOwnTalentProfileId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function redeemInviteCookie(
  cookieStore: CookieStore,
  response: CookieWriter,
): Promise<RedemptionResult> {
  const payload = readInviteFromCookieStore(cookieStore);
  if (!payload) return { ok: false, reason: "no_cookie" };
  return redeemInvitePayload(payload, response);
}

export async function redeemInvitePayload(
  payload: InvitePayload,
  response: CookieWriter,
): Promise<RedemptionResult> {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) {
    return { ok: false, reason: "no_session" };
  }

  const talentProfileId = await resolveOwnTalentProfileId(
    session.supabase,
    session.user.id,
  );
  if (!talentProfileId) {
    return { ok: false, reason: "no_profile" };
  }

  const targetType = await resolveInviterTargetType(
    session.supabase,
    payload.inviterTenantId,
  );
  if (!targetType) {
    clearInviteCookieOnResponse(response);
    return { ok: false, reason: "invalid_tenant" };
  }

  const result = await submitRepresentationRequest({
    talentProfileId,
    targetType,
    targetId: payload.inviterTenantId,
    note: null,
  });

  if (result.ok) {
    clearInviteCookieOnResponse(response);
    return { ok: true, outcome: "converted", inviterTenantId: payload.inviterTenantId };
  }

  if (result.error === "A request is already open for this target.") {
    clearInviteCookieOnResponse(response);
    return {
      ok: true,
      outcome: "already_open",
      inviterTenantId: payload.inviterTenantId,
    };
  }

  return { ok: false, reason: "submit_failed", message: result.error };
}
