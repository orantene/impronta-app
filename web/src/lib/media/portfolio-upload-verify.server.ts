/**
 * portfolio-upload-verify.server.ts: registerPortfolioPhoto's H1 check, in its
 * own module so `roster/[id]/extended-actions.ts` stays under 800 lines.
 *
 * The browser PUTs portfolio photos straight into the PUBLIC bucket. Before a
 * row exists, a FRESH upload (a key under the talent's own prefix) is verified:
 * type from the bytes, pixel cap, EXIF/GPS stripped in place. Re-adds of an
 * existing asset (any other owned key) were verified when first uploaded.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { verifyStoredImage } from "./guarded-upload.server";
import { isTalentOwnedStoragePath } from "./talent-storage-path";
import { PHOTO_RASTER_MIMES } from "./upload-guards";

export const PORTFOLIO_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

export async function verifyPortfolioUpload<T extends { storagePath: string; mimeType?: string; fileSize?: number }>(
  admin: SupabaseClient,
  talentId: string,
  input: T,
  t?: (key: string) => string,
): Promise<{ ok: true; input: T } | { ok: false; error: string }> {
  if (!isTalentOwnedStoragePath(talentId, input.storagePath)) return { ok: true, input };
  const verified = await verifyStoredImage(admin, "media-public", input.storagePath, {
    maxBytes: PORTFOLIO_PHOTO_MAX_BYTES,
    allowed: PHOTO_RASTER_MIMES,
    t,
  });
  if (!verified.ok) return { ok: false, error: verified.error };
  return { ok: true, input: { ...input, mimeType: verified.mime, fileSize: verified.byteSize } };
}
