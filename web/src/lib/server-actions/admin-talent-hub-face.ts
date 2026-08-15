"use server";

/**
 * admin-talent-hub-face.ts — "Photos on this site" curation actions.
 *
 * Media-ownership plan §6: staff choose which of a talent's photos represent
 * that talent on THEIR hub, and which one is the face. Thin auth + audit +
 * cache-bust wrappers only — every query lives in
 * `lib/site-admin/server/talent-hub-face.ts`, which keeps this file free of
 * raw `.from()` per the no-untenanted-from ratchet.
 *
 * The tenant is ALWAYS the caller's own workspace (`requireWorkspaceStaffAction`),
 * never a client-supplied id: curation is per-hub by construction, so a
 * workspace can only ever edit its own face for a talent.
 *
 * Every write busts `tenant:{tenantId}:talent-media:{talentProfileId}` plus the
 * tenant storefront tag. The tenant segment is the point — a talent-only cache
 * key would leak one hub's curated cover onto every other hub.
 */

import { revalidatePath, revalidateTag } from "next/cache";

import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { hubTalentMediaTag } from "@/lib/media/talent-media-for-hub";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  loadHubFaceState,
  setHubCoverAsset,
  setHubMediaCaption,
  setHubMediaOrder,
  setHubMediaSelection,
  setHubMediaVisibility,
  type HubFaceState,
} from "@/lib/site-admin/server/talent-hub-face";

export type { HubFacePhoto, HubFaceState } from "@/lib/site-admin/server/talent-hub-face";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CAPTION_LENGTH = 500;

function bust(tenantId: string, tenantSlug: string, talentProfileId: string): void {
  revalidateTag(hubTalentMediaTag(tenantId, talentProfileId), "default");
  revalidateTag(tagFor(tenantId, "storefront"), "default");
  revalidatePath(`/${tenantSlug}`, "layout");
}

export async function actionLoadTalentHubFace(
  talentProfileId: string,
): Promise<ActionResult<HubFaceState>> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!UUID_RE.test(talentProfileId)) return { ok: false, error: "Invalid request." };

  return loadHubFaceState(auth.supabase, auth.tenantId, talentProfileId);
}

export async function actionSetTalentHubCover(
  talentProfileId: string,
  assetId: string | null,
): Promise<ActionResult<{ coverAssetId: string | null }>> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!UUID_RE.test(talentProfileId)) return { ok: false, error: "Invalid request." };
  if (assetId !== null && !UUID_RE.test(assetId)) return { ok: false, error: "Invalid request." };

  const result = await setHubCoverAsset(auth.supabase, auth.tenantId, talentProfileId, assetId);
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: "media.hub_cover.set",
    summary: assetId ? "Set the site cover photo for a talent" : "Cleared the site cover photo",
    targetType: "talent_profile",
    targetId: talentProfileId,
    metadata: { assetId },
  });

  bust(auth.tenantId, auth.tenantSlug, talentProfileId);
  return result;
}

export async function actionSetTalentHubSelection(
  talentProfileId: string,
  orderedAssetIds: string[],
): Promise<ActionResult<{ selectedAssetIds: string[]; coverAssetId: string | null }>> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!UUID_RE.test(talentProfileId)) return { ok: false, error: "Invalid request." };
  if (!Array.isArray(orderedAssetIds) || orderedAssetIds.length > 60) {
    return { ok: false, error: "Invalid request." };
  }
  if (orderedAssetIds.some((id) => !UUID_RE.test(id))) return { ok: false, error: "Invalid request." };

  const result = await setHubMediaSelection(
    auth.supabase,
    auth.tenantId,
    talentProfileId,
    orderedAssetIds,
    auth.user.id,
  );
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: "media.hub_selection.set",
    summary: "Updated which photos represent a talent on this site",
    targetType: "talent_profile",
    targetId: talentProfileId,
    metadata: { count: result.data.selectedAssetIds.length },
  });

  bust(auth.tenantId, auth.tenantSlug, talentProfileId);
  return result;
}

export async function actionSetTalentHubMediaCaption(
  talentProfileId: string,
  assetId: string,
  caption: string | null,
): Promise<ActionResult<{ caption: string | null }>> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!UUID_RE.test(talentProfileId)) return { ok: false, error: "Invalid request." };
  if (!UUID_RE.test(assetId)) return { ok: false, error: "Invalid request." };
  const trimmed = caption === null ? null : caption.trim();
  if (trimmed !== null && trimmed.length > MAX_CAPTION_LENGTH) {
    return { ok: false, error: "Caption is too long." };
  }
  const normalized = trimmed === "" ? null : trimmed;

  const result = await setHubMediaCaption(
    auth.supabase,
    auth.tenantId,
    talentProfileId,
    assetId,
    normalized,
  );
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: "media.hub_caption.set",
    summary: "Updated a photo caption for a talent on this site",
    targetType: "talent_profile",
    targetId: talentProfileId,
    metadata: { assetId },
  });

  bust(auth.tenantId, auth.tenantSlug, talentProfileId);
  return result;
}

export async function actionSetTalentHubMediaVisibility(
  talentProfileId: string,
  assetId: string,
  visible: boolean,
): Promise<ActionResult<{ visible: boolean }>> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!UUID_RE.test(talentProfileId)) return { ok: false, error: "Invalid request." };
  if (!UUID_RE.test(assetId)) return { ok: false, error: "Invalid request." };
  if (typeof visible !== "boolean") return { ok: false, error: "Invalid request." };

  const result = await setHubMediaVisibility(
    auth.supabase,
    auth.tenantId,
    talentProfileId,
    assetId,
    visible,
  );
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: "media.hub_visibility.set",
    summary: visible
      ? "Included a photo on a talent's site again"
      : "Excluded a photo from a talent's site",
    targetType: "talent_profile",
    targetId: talentProfileId,
    metadata: { assetId, visible },
  });

  bust(auth.tenantId, auth.tenantSlug, talentProfileId);
  return result;
}

export async function actionReorderTalentHubMedia(
  talentProfileId: string,
  orderedAssetIds: string[],
): Promise<ActionResult<{ orderedAssetIds: string[] }>> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!UUID_RE.test(talentProfileId)) return { ok: false, error: "Invalid request." };
  if (!Array.isArray(orderedAssetIds) || orderedAssetIds.length > 60) {
    return { ok: false, error: "Invalid request." };
  }
  if (orderedAssetIds.some((id) => !UUID_RE.test(id))) return { ok: false, error: "Invalid request." };

  const result = await setHubMediaOrder(auth.supabase, auth.tenantId, talentProfileId, orderedAssetIds);
  if (!result.ok) return result;

  scheduleWorkspaceAudit({
    tenantId: auth.tenantId,
    category: "media",
    action: "media.hub_order.set",
    summary: "Reordered a talent's photos on this site",
    targetType: "talent_profile",
    targetId: talentProfileId,
    metadata: { count: result.data.orderedAssetIds.length },
  });

  bust(auth.tenantId, auth.tenantSlug, talentProfileId);
  return result;
}
