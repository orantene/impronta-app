// D4 slice 1 — toggle a single talent in/out of the client's favorites.
//
// POST   /api/discover/favorites/:talentId  → 200 { ok: true, favorited: true }
// DELETE /api/discover/favorites/:talentId  → 200 { ok: true, favorited: false }
//
// Idempotent — POST on an already-favorited talent returns ok=true without
// duplicating. Same for DELETE on a non-favorited row.
//
// Auth: any logged-in client. Talent must be discoverable + approved to
// be favoritable in the first place (prevents leaking the existence of
// hidden talents to a client who somehow knew the id).

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

async function assertDiscoverable(talentId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data } = await admin
    .from("talent_profiles")
    .select("id, is_discoverable, workflow_status")
    .eq("id", talentId)
    .maybeSingle();
  if (!data) return false;
  if (!data.is_discoverable) return false;
  return data.workflow_status === "approved" || data.workflow_status === "published";
}

export async function POST(_req: Request, { params }: { params: Promise<{ talentId: string }> }) {
  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { talentId } = await params;
  if (!talentId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  if (!(await assertDiscoverable(talentId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { error } = await admin
    .from("client_favorites")
    .upsert(
      { client_user_id: session.user.id, talent_profile_id: talentId },
      { onConflict: "client_user_id,talent_profile_id" },
    );

  if (error) {
    logServerError("api.discover.favorites.add", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, favorited: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ talentId: string }> }) {
  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { talentId } = await params;
  if (!talentId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { error } = await admin
    .from("client_favorites")
    .delete()
    .eq("client_user_id", session.user.id)
    .eq("talent_profile_id", talentId);

  if (error) {
    logServerError("api.discover.favorites.remove", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, favorited: false });
}
