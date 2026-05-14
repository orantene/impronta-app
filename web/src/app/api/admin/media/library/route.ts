/**
 * GET /api/admin/media/library?tenantId=<uuid>            → full library (cap 60)
 * GET /api/admin/media/library?tenantId=<uuid>&id=<uuid>  → single asset
 *
 * Returns approved media_assets for the tenant (newest first, capped at 60)
 * so admin MediaPicker can render thumbnails without a server component
 * round-trip. Auth is requireStaff + tenant-scope parity check — the
 * requested tenantId MUST match the caller's resolved tenant scope, so
 * no-one can enumerate another tenant's imagery.
 *
 * QA 2026-05-13 — the `?id=` filter was added so surfaces that already
 * know the asset id they want (e.g. BrandTab's LogoField resolving a
 * stored `shell.brand-logo-media-asset-id` token to a publicUrl)
 * don't have to fetch up to 60 items + scan client-side. Single-asset
 * lookups are a server-side `.eq("id", id)` instead.
 */

import { NextResponse } from "next/server";

import {
  getTenantMediaAsset,
  listTenantMediaLibrary,
} from "@/lib/site-admin/server/media-library";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const requestedTenant = url.searchParams.get("tenantId");
  if (!requestedTenant || requestedTenant !== scope.tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId mismatch" },
      { status: 403 },
    );
  }

  const requestedId = url.searchParams.get("id");
  if (requestedId) {
    if (!UUID_RE.test(requestedId)) {
      return NextResponse.json(
        { ok: false, error: "invalid id" },
        { status: 400 },
      );
    }
    const item = await getTenantMediaAsset(
      auth.supabase,
      scope.tenantId,
      requestedId,
    );
    // Return the same `{ ok, items }` shape so callers can use one
    // parser path. `items` is just always 0-or-1 in this branch.
    return NextResponse.json({ ok: true, items: item ? [item] : [] });
  }

  const items = await listTenantMediaLibrary(auth.supabase, scope.tenantId);
  return NextResponse.json({ ok: true, items });
}
