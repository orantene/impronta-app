"use server";

/**
 * Profile shell drawer media reads (TUL-277). Kept out of `actions.ts` (a
 * budgeted god file); the row work lives in `profile-shell-media-overview.server`.
 */

import {
  loadProfileShellAlbumPage,
  loadProfileShellMediaOverview,
} from "@/lib/media/profile-shell-media-overview.server";
import type {
  AlbumPage,
  ProfileShellMediaOverview,
} from "@/lib/media/profile-shell-media-overview.server";
import { authorizeTalentMediaRead } from "@/lib/media/talent-media-read-auth.server";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Albums with counts + covers, singletons and the gallery's first page. */
export async function actionLoadProfileShellMedia(
  talentProfileId: string,
): Promise<ActionResult<ProfileShellMediaOverview>> {
  const auth = await authorizeTalentMediaRead(talentProfileId);
  if (!auth.ok) return auth;
  const overview = await loadProfileShellMediaOverview(auth.admin, talentProfileId);
  if (overview.degraded) return { ok: false, error: "Could not load media." };
  return { ok: true, data: overview };
}

/** One album's photos, paged with the bundle's offset cursor. */
export async function actionLoadProfileShellAlbumPage(
  talentProfileId: string,
  opts: { albumId: string; includeUnassigned?: boolean; offset?: number; limit?: number },
): Promise<ActionResult<AlbumPage>> {
  if (typeof opts?.albumId !== "string" || opts.albumId.length === 0 || opts.albumId.length > 200) {
    return { ok: false, error: "Unknown album." };
  }
  const auth = await authorizeTalentMediaRead(talentProfileId);
  if (!auth.ok) return auth;
  const page = await loadProfileShellAlbumPage(auth.admin, talentProfileId, {
    albumId: opts.albumId,
    includeUnassigned: opts.includeUnassigned === true,
    offset: opts.offset,
    limit: opts.limit,
  });
  if (!page) return { ok: false, error: "Could not load media." };
  return { ok: true, data: page };
}
