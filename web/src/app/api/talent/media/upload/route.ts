/**
 * POST /api/talent/media/upload
 *
 * Talent-self image upload for the Max-tier page-builder picker. Lets a talent
 * upload a NEW photo directly from the builder's image picker (instead of the
 * staff-only `/api/admin/media/upload`, which rejects talents). The created
 * `media_assets` row is OWNED by the talent (`owner_talent_profile_id`) and
 * scoped to their managing tenant, so it appears immediately in "My uploads"
 * via `listTalentScopedMediaLibrary` (the same source the picker reads).
 *
 * Auth: talent-self ownership ONLY (`requireTalentSelfAction`) — staff keep
 * using `/api/admin/media/upload`. An INDEPENDENT talent with no managing tenant
 * has nowhere tenant-scoped to store the asset, so the upload is rejected with a
 * clear message (they add photos through their profile flow instead).
 *
 * Images only. Sharp-resized server-side (egress control); `≤ MAX_UPLOAD_BYTES`.
 * Multipart form: `file` (Blob) + `talentProfileId` (uuid). Returns the created
 * item (id + publicUrl) so the picker can insert it without a round-trip reload.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireTalentSelfAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  resizeUploadForStorage,
  shouldResize,
  MAX_UPLOAD_BYTES,
} from "@/lib/server/media-resize";
import { validateImageUpload } from "@/lib/site-admin/media/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "media-public";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed multipart form." },
      { status: 400 },
    );
  }

  const talentProfileId = form.get("talentProfileId");
  if (typeof talentProfileId !== "string" || !UUID_RE.test(talentProfileId)) {
    return NextResponse.json(
      { ok: false, error: "talentProfileId required" },
      { status: 400 },
    );
  }

  // SECURITY: only the talent who owns this profile may upload here. The
  // ownership check (user_id === auth user) is inside requireTalentSelfAction;
  // staff use the agency route. tenantId is the managing tenant we scope the
  // asset to (never client-supplied).
  const self = await requireTalentSelfAction(talentProfileId);
  if (!self.ok) {
    return NextResponse.json({ ok: false, error: self.error }, { status: 401 });
  }
  if (!self.tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Your profile isn't connected to an agency yet, so there's nowhere to store uploads. Add photos through your profile first.",
      },
      { status: 400 },
    );
  }
  const tenantId = self.tenantId;

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `Image exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit.`,
      },
      { status: 413 },
    );
  }

  const mime = (file.type || "").toLowerCase();
  const validation = validateImageUpload({
    mime,
    byteSize: file.size,
    maxBytes: MAX_UPLOAD_BYTES,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: validation.status },
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Server is missing service-role credentials." },
      { status: 500 },
    );
  }

  // Sharp-resize (SVG/GIF bypass inside shouldResize) before storage.
  const rawBuffer = Buffer.from(await file.arrayBuffer());
  let uploadBuffer: Buffer = rawBuffer;
  let uploadContentType = mime;
  let uploadExt = validation.ext;
  if (shouldResize(mime)) {
    try {
      const resized = await resizeUploadForStorage(rawBuffer, "gallery");
      uploadBuffer = resized.buffer;
      uploadContentType = resized.mimeType;
      uploadExt = resized.ext;
    } catch (e) {
      logServerError("api.talent.media.upload.resize", e);
      return NextResponse.json(
        { ok: false, error: "Could not process image. Try a different file." },
        { status: 400 },
      );
    }
  }

  const storagePath = `tenant/${tenantId}/talent/${talentProfileId}/${randomUUID()}.${uploadExt}`;
  const upload = await supabase.storage.from(BUCKET).upload(storagePath, uploadBuffer, {
    contentType: uploadContentType,
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
        tenant_id: tenantId,
        owner_talent_profile_id: talentProfileId,
        uploaded_by_user_id: self.user.id,
        bucket_id: BUCKET,
        storage_path: storagePath,
        variant_kind: "original",
        approval_state: "approved",
        purpose: "cms",
        sort_order: 0,
        file_size: uploadBuffer.length,
        metadata: {
          source: "talent-upload",
          original_mime: mime,
          original_file_name: (file as { name?: string }).name ?? null,
        },
      },
    ])
    .select("id, bucket_id, storage_path, variant_kind, created_at")
    .single();

  if (insertErr || !inserted) {
    // Best-effort cleanup — a storage object with no DB row is an orphan.
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
    },
  });
}
