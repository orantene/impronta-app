// GET /api/client/pitches/count
//   → 200 { count: number }
//   → 401 unauthenticated
//
// Lightweight counter for the client topbar Pitches badge. Counts every
// pitch addressed to the signed-in client via `recipient_user_id` —
// account-global, not tenant-scoped (matches the page surface). Service
// role read because the client doesn't own pitches; their RLS visibility
// is gated by `recipient_user_id = auth.uid()` and we want the count
// regardless of which agency host the topbar is currently rendering on.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ count: 0 });

  const { count, error } = await admin
    .from("pitches")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", session.user.id);

  if (error) {
    logServerError("api.client.pitches.count", error);
    return NextResponse.json({ count: 0 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
