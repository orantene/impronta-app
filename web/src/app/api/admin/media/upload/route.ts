/**
 * POST /api/admin/media/upload
 *
 * Accepts a multipart form with a single `file` field + a `tenantId`
 * field. Writes the binary to the `media-public` bucket under
 *   tenant/<tenant_id>/library/<uuid>.<ext>
 * and inserts a `media_assets` row with purpose='cms',
 * approval_state='approved', variant_kind='original'. Returns the
 * created row + its public URL so the caller can immediately use it.
 *
 * Auth:
 *   - requireStaff
 *   - tenantId must match the caller's resolved scope (no cross-tenant
 *     uploads).
 *
 * Size / type guards:
 *   - Max 10 MB (enforced in-process; Supabase bucket may also cap).
 *   - MIME whitelist: image/jpeg, image/png, image/webp, image/gif,
 *     image/svg+xml. Unknown types rejected with 415.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES_IMAGE = 10 * 1024 * 1024;       // 10 MB
const MAX_BYTES_DOCUMENT = 25 * 1024 * 1024;    // 25 MB
const MAX_BYTES_VIDEO = 200 * 1024 * 1024;      // 200 MB
const BUCKET = "media-public";

// MIME → file-extension maps per asset kind. Kind comes from the
// `kind` form field; defaults to "image" for back-compat with the
// original image-only route.
const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const DOCUMENT_MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
};

const VIDEO_MIME_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
};

type AssetKind = "image" | "document" | "video";

function resolveKindConfig(kind: AssetKind): {
  mimeMap: Record<string, string>;
  maxBytes: number;
  purpose: string;
  variantKind: string;
  acceptedLabel: string;
} {
  switch (kind) {
    case "document":
      return {
        mimeMap: DOCUMENT_MIME_TO_EXT,
        maxBytes: MAX_BYTES_DOCUMENT,
        purpose: "document",
        variantKind: "document",
        acceptedLabel: "PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV",
      };
    case "video":
      return {
        mimeMap: VIDEO_MIME_TO_EXT,
        maxBytes: MAX_BYTES_VIDEO,
        purpose: "video",
        variantKind: "video",
        acceptedLabel: "MP4, MOV, WebM, AVI, MKV",
      };
    case "image":
    default:
      return {
        mimeMap: IMAGE_MIME_TO_EXT,
        maxBytes: MAX_BYTES_IMAGE,
        purpose: "cms",
        variantKind: "original",
        acceptedLabel: "JPEG, PNG, WebP, GIF, SVG",
      };
  }
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed multipart form." },
      { status: 400 },
    );
  }

  const requestedTenant = form.get("tenantId");
  if (typeof requestedTenant !== "string" || requestedTenant !== scope.tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId mismatch" },
      { status: 403 },
    );
  }

  // Kind discriminator (default "image" for back-compat with the
  // original route signature). Drives MIME whitelist + size cap +
  // purpose + variant_kind on the inserted row.
  const kindRaw = form.get("kind");
  const kind: AssetKind =
    kindRaw === "document" || kindRaw === "video" ? kindRaw : "image";
  const kindCfg = resolveKindConfig(kind);

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing file." },
      { status: 400 },
    );
  }
  if (file.size > kindCfg.maxBytes) {
    return NextResponse.json(
      { ok: false, error: `File exceeds ${Math.round(kindCfg.maxBytes / 1024 / 1024)}MB limit for ${kind}s.` },
      { status: 413 },
    );
  }

  const mime = (file.type || "").toLowerCase();
  const ext = kindCfg.mimeMap[mime];
  if (!ext) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unsupported ${kind} type "${mime || "unknown"}". Accepted: ${kindCfg.acceptedLabel}.`,
      },
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

  const objectId = randomUUID();
  // Documents + videos live in subdirectories so the bucket inspector
  // separates them visually from the image library.
  const subPath =
    kind === "document" ? "documents" : kind === "video" ? "videos" : "library";
  const storagePath = `tenant/${scope.tenantId}/${subPath}/${objectId}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mime,
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) {
    return NextResponse.json(
      { ok: false, error: `Storage upload failed: ${upload.error.message}` },
      { status: 500 },
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("media_assets")
    .insert([
      {
        tenant_id: scope.tenantId,
        uploaded_by_user_id: auth.user.id,
        bucket_id: BUCKET,
        storage_path: storagePath,
        variant_kind: kindCfg.variantKind,
        approval_state: "approved",
        purpose: kindCfg.purpose,
        sort_order: 0,
        file_size: buffer.length,
        metadata: {
          source: "admin-upload",
          original_mime: mime,
          kind,
          original_file_name: (file as { name?: string }).name ?? null,
        },
      },
    ])
    .select("id, bucket_id, storage_path, variant_kind, created_at")
    .single();

  if (insertErr || !inserted) {
    // Best-effort cleanup — storage row without a DB row is an orphan.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(
      {
        ok: false,
        error: `Could not record the uploaded asset: ${insertErr?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage
    .from(inserted.bucket_id)
    .getPublicUrl(inserted.storage_path);

  return NextResponse.json({
    ok: true,
    item: {
      id: inserted.id,
      variantKind: inserted.variant_kind,
      storagePath: inserted.storage_path,
      publicUrl: urlData?.publicUrl ?? "",
      createdAt: inserted.created_at,
      width: null,
      height: null,
    },
  });
}
