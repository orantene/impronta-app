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

const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "media-public";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

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

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing file." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `File exceeds ${Math.round(MAX_BYTES / 1024 / 1024)}MB limit.` },
      { status: 413 },
    );
  }

  const mime = (file.type || "").toLowerCase();
  const ext = MIME_TO_EXT[mime];
  if (!ext) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unsupported image type "${mime || "unknown"}". Accepted: JPEG, PNG, WebP, GIF, SVG.`,
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
  const storagePath = `tenant/${scope.tenantId}/library/${objectId}.${ext}`;

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
        variant_kind: "original",
        approval_state: "approved",
        purpose: "cms",
        sort_order: 0,
        file_size: buffer.length,
        metadata: {
          source: "admin-upload",
          original_mime: mime,
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
