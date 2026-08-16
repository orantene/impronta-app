/**
 * POST /api/admin/media/upload/svg
 *
 * SVG lane for the CMS media library. SVG deliberately does NOT ride the
 * signed-PUT pipeline: a signed URL puts caller-controlled bytes into the
 * PUBLIC bucket the instant the PUT lands, and an SVG served as
 * image/svg+xml is stored XSS from that moment — even if a later
 * `register` call would have sanitized it (or never came at all).
 *
 * So the text rides this route instead (SVGs are text and capped at
 * 256 KB, so the request body is never near any transport limit), the
 * server sanitizes it with the same strict brand-mark allowlist
 * `uploadAgencyLogo` uses, and ONLY the sanitized bytes are ever written
 * to storage. The row is stamped `metadata.svg_sanitized = true`, which is
 * what `resolveAssetKind` requires before it will classify an SVG as a
 * library image at all.
 *
 * Body (JSON): { tenantId: string, svg: string, originalFilename?: string }
 * Returns: { ok: true, item: MediaItem } — same shape as upload/register.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { auditFailure } from "@/lib/audit/emit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sanitizeSvgLogoBuffer } from "@/lib/site-admin/sanitize-svg-upload";
import { insertTenantImageAsset } from "@/lib/site-admin/media/assets";
import {
  SVG_LIBRARY_MAX_BYTES,
  SVG_SANITIZED_METADATA_KEY,
} from "@/lib/site-admin/media/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "media-public";
const SVG_MIME = "image/svg+xml";

export async function POST(req: Request) {
  const auth = await requireSession();
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

  const svgText = typeof body.svg === "string" ? body.svg : null;
  if (!svgText || !svgText.trim()) {
    return NextResponse.json({ ok: false, error: "Missing file." }, { status: 400 });
  }
  if (Buffer.byteLength(svgText, "utf8") > SVG_LIBRARY_MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `SVG exceeds ${Math.round(SVG_LIBRARY_MAX_BYTES / 1024)}KB limit.`,
      },
      { status: 413 },
    );
  }

  const sanitized = sanitizeSvgLogoBuffer(svgText);
  if (!sanitized.ok) {
    auditFailure(scope.tenantId, "media", "media.upload.failed", "An upload was rejected", {
      targetType: "media_asset",
      reason: sanitized.error,
    });
    return NextResponse.json({ ok: false, error: sanitized.error }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Server is missing service-role credentials." },
      { status: 500 },
    );
  }

  const storagePath = `tenant/${scope.tenantId}/library/${randomUUID()}.svg`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, sanitized.bytes, {
      contentType: SVG_MIME,
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: `Could not store the SVG: ${upErr.message}` },
      { status: 500 },
    );
  }

  const originalFilename =
    typeof body.originalFilename === "string" ? body.originalFilename : null;

  const inserted = await insertTenantImageAsset({
    supabase,
    tenantId: scope.tenantId,
    createdByUserId: auth.user.id,
    storagePath,
    mime: SVG_MIME,
    byteSize: sanitized.bytes.byteLength,
    // The COLUMN — library-query.ts reads/searches `original_filename` and
    // never looked at the metadata copy below.
    originalFilename,
    metadata: {
      source: "admin-upload-svg",
      original_mime: SVG_MIME,
      kind: "image",
      original_file_name: originalFilename,
      // The gate `resolveAssetKind` reads. Written only on this path, and
      // only for the exact bytes the sanitizer returned above.
      [SVG_SANITIZED_METADATA_KEY]: true,
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

  scheduleWorkspaceAudit({
    tenantId: scope.tenantId,
    category: "media",
    action: "media.uploaded",
    summary: `Uploaded ${originalFilename ?? "an SVG"}`,
    targetType: "media_asset",
    targetId: inserted.item.id,
    metadata: { kind: "image", svg: true },
  });

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
