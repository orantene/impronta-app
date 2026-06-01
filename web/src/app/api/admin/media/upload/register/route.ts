/**
 * POST /api/admin/media/upload/register
 *
 * Register a media asset that the browser has already PUT to a signed
 * URL minted by /api/admin/media/upload/init. Defense-in-depth: we
 * download the just-uploaded object server-side, re-run sharp, and
 * overwrite the storage object if the client failed to compress
 * (or lied). Then we insert the media_assets row and return the same
 * MediaItem shape the legacy /api/admin/media/upload route returns,
 * so callers can swap the two without changing their reducers.
 *
 * Body (JSON):
 *   { tenantId, storagePath, kind?: "image" | "document" | "video",
 *     originalFilename?: string, originalMime?: string }
 *
 * Returns: { ok: true, item: { id, variantKind, storagePath,
 *   publicUrl, createdAt, width, height } }
 */

import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  resizeUploadForStorage,
  shouldResize,
} from "@/lib/server/media-resize";
import { insertTenantImageAsset } from "@/lib/site-admin/media/assets";
import { validateImageUpload } from "@/lib/site-admin/media/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "media-public";

/** Mirrors the threshold in media/actions.ts — if sharp can beat the
 *  stored bytes by ≥20%, overwrite (i.e. caller skipped compression). */
const SERVER_RESIZE_GUARD_RATIO = 0.8;

type Kind = "image" | "document" | "video";

function resolveKindMeta(kind: Kind): {
  purpose: string;
  variantKind: string;
} {
  switch (kind) {
    case "document":
      return { purpose: "document", variantKind: "document" };
    case "video":
      return { purpose: "video", variantKind: "video" };
    case "image":
    default:
      return { purpose: "cms", variantKind: "original" };
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

  const storagePath = typeof body.storagePath === "string" ? body.storagePath : null;
  if (!storagePath) {
    return NextResponse.json(
      { ok: false, error: "Missing storagePath." },
      { status: 400 },
    );
  }

  // Path-shape guard — the init endpoint always builds
  // `tenant/{tenantId}/{subPath}/{uuid}.{ext}`. Refuse anything that
  // doesn't match the caller's tenant prefix.
  const expectedPrefix = `tenant/${scope.tenantId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { ok: false, error: "Storage path doesn't match this workspace." },
      { status: 403 },
    );
  }

  const kindRaw = body.kind;
  const kind: Kind =
    kindRaw === "document" || kindRaw === "video" ? kindRaw : "image";
  const kindMeta = resolveKindMeta(kind);

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Server is missing service-role credentials." },
      { status: 500 },
    );
  }

  // Download what the browser put there so we can size it + decide
  // whether sharp needs to overwrite.
  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);
  if (dlErr || !blob) {
    logServerError("api.admin.media.upload.register.download", dlErr);
    return NextResponse.json(
      { ok: false, error: "Could not verify upload. Try again." },
      { status: 500 },
    );
  }
  const storedBuf = Buffer.from(await blob.arrayBuffer());
  let storedSize = storedBuf.byteLength;
  let storedType = blob.type || "application/octet-stream";
  let width: number | null = null;
  let height: number | null = null;
  const originalFilename =
    typeof body.originalFilename === "string" ? body.originalFilename : null;
  const originalMime =
    typeof body.originalMime === "string" ? body.originalMime : storedType;
  const initialMime =
    storedType && storedType !== "application/octet-stream"
      ? storedType
      : originalMime;

  if (kind === "image") {
    const validation = validateImageUpload({
      mime: initialMime,
      byteSize: storedSize,
    });
    if (!validation.ok) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json(
        { ok: false, error: validation.error },
        { status: validation.status },
      );
    }
  }

  // Defense-in-depth resize for images. Documents and videos pass
  // through unchanged (legacy route doesn't touch them either).
  if (kind === "image" && shouldResize(initialMime)) {
    try {
      const resized = await resizeUploadForStorage(storedBuf, "gallery");
      width = resized.width;
      height = resized.height;
      if (resized.byteSize < storedSize * SERVER_RESIZE_GUARD_RATIO) {
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, resized.buffer, {
            contentType: resized.mimeType,
            upsert: true,
          });
        if (!upErr) {
          storedSize = resized.byteSize;
          storedType = resized.mimeType;
        } else {
          // Non-fatal — we still have valid bytes in storage, just
          // bigger than they could be. Log and proceed.
          logServerError("api.admin.media.upload.register.overwrite", upErr);
        }
      }
    } catch (e) {
      logServerError("api.admin.media.upload.register.resize", e);
      // Image was probably hostile / corrupt — clean up + bail so we
      // don't leave a half-broken row pointing at junk.
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json(
        { ok: false, error: "Could not process image. Try a different file." },
        { status: 400 },
      );
    }
  }

  if (kind === "image") {
    const inserted = await insertTenantImageAsset({
      supabase,
      tenantId: scope.tenantId,
      createdByUserId: auth.user.id,
      storagePath,
      mime: storedType && storedType !== "application/octet-stream" ? storedType : initialMime,
      byteSize: storedSize,
      width,
      height,
      metadata: {
        source: "admin-upload-signed",
        original_mime: originalMime,
        kind,
        original_file_name: originalFilename,
      },
    });
    if (!inserted.item) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json(
        {
          ok: false,
          error: `Could not record the uploaded asset: ${inserted.error ?? "unknown"}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      item: {
        id: inserted.item.id,
        variantKind: inserted.item.variantKind,
        storagePath: inserted.item.storagePath,
        publicUrl: inserted.item.publicUrl,
        createdAt: inserted.item.createdAt,
        width: inserted.item.width,
        height: inserted.item.height,
        alt: inserted.item.alt,
      },
    });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("media_assets")
    .insert([
      {
        tenant_id: scope.tenantId,
        uploaded_by_user_id: auth.user.id,
        bucket_id: BUCKET,
        storage_path: storagePath,
        variant_kind: kindMeta.variantKind,
        approval_state: "approved",
        purpose: kindMeta.purpose,
        sort_order: 0,
        file_size: storedSize,
        metadata: {
          source: "admin-upload-signed",
          original_mime: originalMime,
          kind,
          original_file_name: originalFilename,
        },
      },
    ])
    .select("id, bucket_id, storage_path, variant_kind, created_at")
    .single();

  if (insertErr || !inserted) {
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
      width,
      height,
    },
  });
}
