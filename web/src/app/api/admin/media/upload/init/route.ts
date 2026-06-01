/**
 * POST /api/admin/media/upload/init
 *
 * Mint a one-shot signed-upload URL for the CMS media library. The
 * browser then PUTs the (already client-compressed) bytes directly to
 * Supabase, bypassing this server entirely for the data path.
 *
 * Companion to /api/admin/media/upload/register, which inserts the
 * media_assets row + runs the defense-in-depth sharp resize after the
 * PUT.
 *
 * Body (JSON):
 *   { tenantId: string, kind?: "image" | "document" | "video",
 *     ext?: string }
 *
 * Returns:
 *   { ok: true, uploadUrl, storagePath, bucketId }
 *
 * Auth: requireStaff + tenant scope must match (mirrors the legacy
 * upload route).
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "media-public";

// Allowed extensions per kind. Caller (compressImage on the client)
// passes whichever the compressed File ends up as. Defaults to jpg —
// the dominant case for photos.
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const DOCUMENT_EXTS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
]);
const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "avi", "mkv"]);

function resolveSubPath(kind: "image" | "document" | "video"): string {
  return kind === "document" ? "documents" : kind === "video" ? "videos" : "library";
}

function resolveExtSet(kind: "image" | "document" | "video"): Set<string> {
  return kind === "document" ? DOCUMENT_EXTS : kind === "video" ? VIDEO_EXTS : IMAGE_EXTS;
}

export async function POST(req: Request) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return NextResponse.json(
      { ok: false, error: "Select an agency workspace first." },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed JSON." }, { status: 400 });
  }

  const requestedTenant = typeof body.tenantId === "string" ? body.tenantId : null;
  if (requestedTenant !== scope.tenantId) {
    return NextResponse.json({ ok: false, error: "tenantId mismatch" }, { status: 403 });
  }

  const kindRaw = body.kind;
  const kind: "image" | "document" | "video" =
    kindRaw === "document" || kindRaw === "video" ? kindRaw : "image";

  const extRaw = typeof body.ext === "string" ? body.ext.toLowerCase().replace(/^\./, "") : "jpg";
  const validExts = resolveExtSet(kind);
  const ext = validExts.has(extRaw) ? extRaw : kind === "image" ? "jpg" : null;
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: `Unsupported ${kind} extension "${extRaw}".` },
      { status: 415 },
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Server is missing service-role credentials." },
      { status: 500 },
    );
  }

  const subPath = resolveSubPath(kind);
  const storagePath = `tenant/${scope.tenantId}/${subPath}/${randomUUID()}.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: `Could not create signed URL: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    uploadUrl: data.signedUrl,
    storagePath: data.path ?? storagePath,
    bucketId: BUCKET,
  });
}
