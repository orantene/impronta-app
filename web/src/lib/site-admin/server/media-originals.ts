import "server-only";

/**
 * media-originals.ts — issuing a download link for one media asset, under the
 * owner-only originals policy (plan §9 decision 2).
 *
 * Every query behind the download action lives here so the action stays auth +
 * policy + audit only and holds no raw `.from()` (the server-actions ratchet).
 *
 * THE POLICY ITSELF IS NOT HERE. It is pure and lives in
 * `@/lib/media/originals-policy`, so the same verdict can be unit-tested and
 * rendered as UI copy. This module only fetches facts and turns a verdict into
 * a URL.
 *
 * WHY THE SIGNED URL IS SHORT-LIVED AND SINGLE-ASSET
 * ─────────────────────────────────────────────────
 * `actionGetTalentDocumentSignedUrl` — the only other read-signing path in the
 * app — takes a caller-supplied bucket AND path. This one takes an asset id
 * and reads both from the row, so a crafted path cannot reach an object the
 * policy never looked at.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveOriginalsAccess,
  type OriginalsAccessVerdict,
} from "@/lib/media/originals-policy";
import { logServerError } from "@/lib/server/safe-error";

const PUBLIC_BUCKET = "media-public";
const ORIGINALS_BUCKET = "media-originals";

/** Long enough to click, short enough that a leaked link is worthless. */
const SIGNED_URL_TTL_SECONDS = 300;

export type MediaDownloadLink = {
  url: string;
  /** What the caller actually got, after the policy. */
  level: OriginalsAccessVerdict["level"];
  reason: OriginalsAccessVerdict["reason"];
  /** Plain-language explanation. Always present, grant or refusal. */
  message: string;
  /** Suggested filename, when the row recorded one. */
  filename: string | null;
};

export type MediaDownloadResult =
  | { ok: true; data: MediaDownloadLink }
  | { ok: false; error: string };

type AssetRow = {
  id: string;
  storage_path: string | null;
  bucket_id: string | null;
  ownership_kind: string | null;
  owner_tenant_id: string | null;
  owner_talent_profile_id: string | null;
  original_filename: string | null;
};

/**
 * Resolve a download link for one asset under the originals policy.
 *
 * A non-owner is NOT handed an error — they are handed the web-size file plus
 * the sentence explaining why it is the web-size file. Plan §9.2 is "subjects
 * get web-size", not "subjects get nothing", and a silent smaller file would
 * be the same silent-absence bug the rest of this program exists to kill.
 */
export async function resolveMediaDownloadLink(
  admin: SupabaseClient,
  input: {
    assetId: string;
    viewerTenantId: string | null;
    viewerTalentProfileId: string | null;
  },
): Promise<MediaDownloadResult> {
  const { data, error } = await admin
    .from("media_assets")
    .select(
      "id, storage_path, bucket_id, ownership_kind, owner_tenant_id, owner_talent_profile_id, original_filename",
    )
    .eq("id", input.assetId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logServerError("media-originals.loadAsset", error);
    return { ok: false, error: "Could not load that photo. Try again." };
  }

  const asset = data as AssetRow | null;
  if (!asset?.storage_path) return { ok: false, error: "That photo is no longer available." };

  const verdict = resolveOriginalsAccess(
    {
      ownershipKind: asset.ownership_kind,
      ownerTenantId: asset.owner_tenant_id,
      ownerTalentProfileId: asset.owner_talent_profile_id,
    },
    {
      tenantId: input.viewerTenantId,
      talentProfileId: input.viewerTalentProfileId,
    },
  );

  const url =
    verdict.level === "original"
      ? await signOriginal(admin, asset)
      : publicUrl(admin, asset.storage_path);

  if (!url) return { ok: false, error: "Could not prepare that download. Try again." };

  return {
    ok: true,
    data: {
      url,
      level: verdict.level,
      reason: verdict.reason,
      message: verdict.message,
      filename: asset.original_filename,
    },
  };
}

function publicUrl(admin: SupabaseClient, storagePath: string): string {
  if (storagePath.startsWith("http") || storagePath.startsWith("/")) return storagePath;
  return admin.storage.from(PUBLIC_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/**
 * Sign the private-bucket object when there is one; otherwise the public file
 * IS the highest-fidelity copy that exists (every upload path recompresses
 * before storage today — see `originals-policy.ts`), so the owner gets that.
 */
async function signOriginal(admin: SupabaseClient, asset: AssetRow): Promise<string | null> {
  const path = asset.storage_path;
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("/")) return path;

  const { data } = await admin.storage
    .from(ORIGINALS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: asset.original_filename ?? true });

  if (data?.signedUrl) return data.signedUrl;
  return publicUrl(admin, path);
}
