/**
 * GET /api/admin/media/library?tenantId=<uuid>
 *
 * Returns approved media_assets for the tenant (newest first, capped at 60)
 * so admin MediaPicker can render thumbnails without a server component
 * round-trip. Auth is requireStaff + tenant-scope parity check — the
 * requested tenantId MUST match the caller's resolved tenant scope, so
 * no-one can enumerate another tenant's imagery.
 */

import { NextResponse } from "next/server";

import { listTenantMediaLibrary } from "@/lib/site-admin/server/media-library";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const items = await listTenantMediaLibrary(auth.supabase, scope.tenantId);
  return NextResponse.json({ ok: true, items });
}
