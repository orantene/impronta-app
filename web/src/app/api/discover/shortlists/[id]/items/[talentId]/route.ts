// D4 slice 2 — remove a talent from a shortlist.
//
// DELETE /api/discover/shortlists/:id/items/:talentId  → 200 { ok: true }
//   → 401 unauthenticated
//   → 403 not your shortlist
//
// Idempotent.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; talentId: string }> },
) {
  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id, talentId } = await params;
  if (!id || !talentId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  // Ownership check.
  const { data: shortlist } = await admin
    .from("client_shortlists")
    .select("id, client_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!shortlist) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (shortlist.client_user_id !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await admin
    .from("client_shortlist_items")
    .delete()
    .eq("shortlist_id", id)
    .eq("talent_profile_id", talentId);

  if (error) {
    logServerError("api.discover.shortlists.items.remove", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
