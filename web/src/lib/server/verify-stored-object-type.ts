import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { fetchStoredObjectHead, verifyDeclaredAgainstBytes } from "@/lib/server/sniff-upload-type";

/**
 * TUL-1289: a signed PUT lets the browser set the stored mimetype, so the
 * finalize lanes sniff the real bytes instead. A mismatch (or an unreadable
 * head) removes the object and refuses; on success the SNIFFED type is the
 * one recorded.
 */
export async function verifyStoredObjectType(
  admin: SupabaseClient,
  bucket: string,
  storagePath: string,
  declared: string,
  opts: { family?: "video" } = {},
): Promise<{ ok: true; mime: string } | { ok: false; error: string }> {
  const head = await fetchStoredObjectHead(admin, bucket, storagePath);
  const verdict = head
    ? verifyDeclaredAgainstBytes(declared, head, opts)
    : ({ ok: false, reason: "Could not verify upload. Try again." } as const);
  if (verdict.ok) return verdict;
  const { error: removeErr } = await admin.storage.from(bucket).remove([storagePath]);
  if (removeErr) logServerError("media.actions.verifyStoredType.remove", removeErr);
  return { ok: false, error: verdict.reason };
}

export type VerifiedReel = { width: null; height: null; byteSize: number; mimeType: string };

/** Reel videos skip sharp; the stat's mimetype is client-set, so the bytes must be a video. */
export async function verifyReelStat(
  admin: SupabaseClient,
  storagePath: string,
  stat: { byteSize: number; mimeType: string } | null,
): Promise<{ ok: true; verified: VerifiedReel | null } | { ok: false; error: string }> {
  if (!stat) return { ok: true, verified: null };
  const typed = await verifyStoredObjectType(admin, "media-public", storagePath, stat.mimeType, { family: "video" });
  if (!typed.ok) return typed;
  return { ok: true, verified: { width: null, height: null, byteSize: stat.byteSize, mimeType: typed.mime } };
}
