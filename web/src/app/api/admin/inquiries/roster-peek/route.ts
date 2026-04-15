import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/server/staff-api-route";
import { loadInquiryRosterPeekMany } from "@/lib/inquiry/inquiry-workspace-data";

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ map: {} });
  }

  const peek = await loadInquiryRosterPeekMany(supabase, ids);
  const out: Record<string, { count: number; labelLine: string }> = {};
  for (const [id, v] of peek.entries()) out[id] = v;

  return NextResponse.json({ map: out });
}

