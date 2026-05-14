"use server";

/**
 * Public server actions for the Pitch feature.
 *
 * These actions are called from the unauthenticated `/share/pitch/[token]`
 * landing page. Auth is the JWT-signed token (verified inside the engine
 * via `loadPitchByToken` → `share_token_id` cross-check). We use the
 * service-role client because:
 *
 *   1. The public landing has no logged-in user, so RLS would block reads
 *      via the anon key.
 *   2. The engine's loadPitchByToken does the equivalent of RLS by
 *      filtering on tenant_id + share_token_id from JWT claims, then
 *      gating on status. Tenant isolation is preserved.
 *
 * If the recipient is signed in, we attempt to read their auth user id
 * from the cached actor session and pass it to the engine for event
 * attribution. Anonymous viewers have viewerUserId = null.
 */

import {
  approvePitch as approvePitchEngine,
  convertPitchToInquiry as convertPitchEngine,
  declinePitch as declinePitchEngine,
  recordPitchView as recordPitchViewEngine,
  removeTalentFromPitch as removeTalentEngine,
} from "@/lib/pitch/pitch-engine";
import type {
  ConvertPitchInput,
  ConvertedPitchOutput,
  PitchResult,
} from "@/lib/pitch/pitch-types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

async function viewerUserId(): Promise<string | null> {
  try {
    const session = await getCachedActorSession();
    return session.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function recordPitchViewAction(token: string): Promise<PitchResult<void>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "internal_error" };
  try {
    return await recordPitchViewEngine(admin, {
      token,
      viewerUserId: await viewerUserId(),
    });
  } catch (e) {
    logServerError("pitches.recordPitchViewAction", e);
    return { ok: false, reason: "internal_error" };
  }
}

export async function removeTalentFromPitchAction(
  token: string,
  talentProfileId: string,
): Promise<PitchResult<void>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "internal_error" };
  try {
    return await removeTalentEngine(admin, {
      token,
      talentProfileId,
      viewerUserId: await viewerUserId(),
    });
  } catch (e) {
    logServerError("pitches.removeTalentFromPitchAction", e);
    return { ok: false, reason: "internal_error" };
  }
}

export async function approvePitchAction(token: string): Promise<PitchResult<void>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "internal_error" };
  try {
    return await approvePitchEngine(admin, {
      token,
      viewerUserId: await viewerUserId(),
    });
  } catch (e) {
    logServerError("pitches.approvePitchAction", e);
    return { ok: false, reason: "internal_error" };
  }
}

export async function declinePitchAction(
  token: string,
  reason?: string | null,
): Promise<PitchResult<void>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "internal_error" };
  try {
    return await declinePitchEngine(admin, {
      token,
      viewerUserId: await viewerUserId(),
      reason: reason ?? null,
    });
  } catch (e) {
    logServerError("pitches.declinePitchAction", e);
    return { ok: false, reason: "internal_error" };
  }
}

export async function convertPitchToInquiryAction(
  input: Omit<ConvertPitchInput, "recipientUserId">,
): Promise<PitchResult<ConvertedPitchOutput>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "internal_error" };
  try {
    const recipientUserId = await viewerUserId();
    return await convertPitchEngine(admin, {
      ...input,
      recipientUserId,
    });
  } catch (e) {
    logServerError("pitches.convertPitchToInquiryAction", e);
    return { ok: false, reason: "internal_error" };
  }
}
