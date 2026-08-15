"use server";

/**
 * talent-media-release.ts — the talent side of the two-key rule (plan §4 V2).
 *
 * A talent sees agency-owned photos of themselves as locked tiles and can ask
 * the owning workspace to release them. That ask writes the SUBJECT key; the
 * workspace's approval writes the OWNER key. Until both exist the photo does
 * not travel — which is the whole design.
 *
 * Auth + validation + cache-bust wrapper only. Every query lives in
 * `@/lib/site-admin/server/media-grants` so this file holds no raw `.from()`,
 * per the server-actions ratchet.
 *
 * The security boundary is `requireTalentSelfAction` (ownership of the talent
 * profile, not a role) — the same guard the talent-self media uploads use.
 */

import { revalidateTag } from "next/cache";

import { hubTalentMediaTag } from "@/lib/media/talent-media-for-hub";
import { requireTalentSelfAction } from "@/lib/saas/admin-scope";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  bustKeysFor,
  loadTalentDisplayName,
  loadTalentMediaLocks,
  requestMediaRelease,
  MAX_RELEASE_ASSETS,
  type ReleaseRequestOutcome,
  type TalentMediaLock,
} from "@/lib/site-admin/server/media-grants";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type { TalentMediaLock } from "@/lib/site-admin/server/media-grants";

/**
 * The locked tiles: every agency-owned photo of this talent, with who owns it
 * and whether a release is live or pending. Never a silent absence — the
 * "I save and nothing changes" incident class is exactly what this avoids.
 */
export async function actionLoadTalentMediaLocks(
  talentProfileId: string,
): Promise<ActionResult<TalentMediaLock[]>> {
  if (!UUID_RE.test(talentProfileId)) return { ok: false, error: "Invalid request." };
  const auth = await requireTalentSelfAction(talentProfileId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  return loadTalentMediaLocks(admin, talentProfileId);
}

/**
 * Ask a workspace to release photos it owns of you.
 *
 * `targetTenantId === null` means "anywhere" (scope `all_hubs`). The owning
 * workspace still has to approve, and can revoke afterwards.
 */
export async function actionRequestMediaRelease(input: {
  talentProfileId: string;
  ownerTenantId: string;
  targetTenantId: string | null;
  assetIds: string[];
  message?: string | null;
}): Promise<ActionResult<ReleaseRequestOutcome>> {
  if (!UUID_RE.test(input.talentProfileId)) return { ok: false, error: "Invalid request." };
  if (!UUID_RE.test(input.ownerTenantId)) return { ok: false, error: "Invalid request." };
  if (input.targetTenantId !== null && !UUID_RE.test(input.targetTenantId)) {
    return { ok: false, error: "Invalid request." };
  }
  if (!Array.isArray(input.assetIds) || input.assetIds.length === 0) {
    return { ok: false, error: "Select at least one photo." };
  }
  if (input.assetIds.length > MAX_RELEASE_ASSETS) {
    return { ok: false, error: `Ask for at most ${MAX_RELEASE_ASSETS} photos at a time.` };
  }
  if (input.assetIds.some((id) => !UUID_RE.test(id))) return { ok: false, error: "Invalid request." };

  const auth = await requireTalentSelfAction(input.talentProfileId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const talentName = await loadTalentDisplayName(admin, input.talentProfileId);

  const result = await requestMediaRelease(admin, {
    talentProfileId: input.talentProfileId,
    talentName,
    ownerTenantId: input.ownerTenantId,
    targetTenantId: input.targetTenantId,
    assetIds: input.assetIds,
    message: typeof input.message === "string" ? input.message.slice(0, 1000) : null,
    actorUserId: auth.user.id,
  });
  if (!result.ok) return result;

  // The subject key moved, so the lock state the tiles render is stale even
  // though nothing is presentable yet.
  for (const key of bustKeysFor(input.talentProfileId, input.ownerTenantId, input.targetTenantId)) {
    revalidateTag(hubTalentMediaTag(key.tenantId, key.talentProfileId), "default");
    revalidateTag(tagFor(key.tenantId, "storefront"), "default");
  }

  return result;
}
