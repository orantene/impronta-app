"use server";

/**
 * media-download.ts — the ONE way a media asset's file leaves the app.
 *
 * Plan §9 decision 2: originals are owner-only; subjects and other hubs get
 * the web-size file. Before this action there was no photo download path at
 * all (only the talent DOCUMENT vault), so the policy goes in at the moment
 * the first one exists rather than being retrofitted onto three call sites
 * later — which is how "one gate" turned into "three readers disagree" the
 * last three times in this codebase.
 *
 * Auth + policy + audit wrapper only. Queries live in
 * `@/lib/site-admin/server/media-originals`, so this file holds no raw
 * `.from()` (the server-actions ratchet).
 *
 * SCOPE: workspace staff. The talent-side "download my own photo" surface does
 * not exist yet; when it lands it calls `resolveMediaDownloadLink` with a
 * `viewerTalentProfileId` and gets the same verdict from the same pure policy.
 */

import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import {
  resolveMediaDownloadLink,
  type MediaDownloadLink,
} from "@/lib/site-admin/server/media-originals";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type { MediaDownloadLink } from "@/lib/site-admin/server/media-originals";

/**
 * A download link for one photo, at the fidelity the policy allows.
 *
 * Always returns the explanation alongside the link: a caller who gets the
 * web-size file must be told that is what happened, never handed a quietly
 * smaller file.
 */
export async function actionGetMediaDownloadLink(input: {
  assetId: string;
}): Promise<ActionResult<MediaDownloadLink>> {
  if (!UUID_RE.test(input.assetId)) return { ok: false, error: "Invalid request." };

  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const result = await resolveMediaDownloadLink(admin, {
    assetId: input.assetId,
    viewerTenantId: auth.tenantId,
    viewerTalentProfileId: null,
  });
  if (!result.ok) return result;

  // Only originals are worth an audit row — a web-size download is the same
  // bytes any visitor can already fetch from the public bucket.
  if (result.data.level === "original") {
    scheduleWorkspaceAudit({
      tenantId: auth.tenantId,
      category: "media",
      action: "media.original_downloaded",
      summary: "Downloaded an original photo file",
      targetType: "media_asset",
      targetId: input.assetId,
      metadata: { reason: result.data.reason },
    });
  }

  return result;
}
