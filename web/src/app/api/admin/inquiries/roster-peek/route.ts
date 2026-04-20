import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/server/staff-api-route";
import { loadInquiryRosterPeekMany } from "@/lib/inquiry/inquiry-workspace-data";
import { getTenantScope } from "@/lib/saas/scope";

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const scope = await getTenantScope();
  if (!scope) {
    return NextResponse.json({ error: "No tenant scope" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawIds = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawIds.length === 0) {
    return NextResponse.json({ map: {} });
  }

  // Only accept ids that belong to the caller's tenant. Drops any cross-tenant
  // ids silently — same posture as RLS would take.
  const { data: scopedRows } = await supabase
    .from("inquiries")
    .select("id")
    .eq("tenant_id", scope.tenantId)
    .in("id", rawIds);
  const ids = (scopedRows ?? []).map((r) => r.id as string);
  if (ids.length === 0) {
    return NextResponse.json({ map: {} });
  }

  const peek = await loadInquiryRosterPeekMany(supabase, ids);
  const out: Record<string, { count: number; labelLine: string }> = {};
  for (const [id, v] of peek.entries()) out[id] = v;

  return NextResponse.json({ map: out });
}

