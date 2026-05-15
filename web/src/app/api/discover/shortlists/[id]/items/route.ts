// D4 slice 2 — add a talent to a shortlist.
//
// POST /api/discover/shortlists/:id/items  { talentId }
//   → 200 { ok: true }
//   → 401 unauthenticated
//   → 403 not your shortlist
//   → 404 talent not discoverable
//
// Idempotent on the talent membership — re-adding doesn't fail. The
// shortlist's updated_at bumps automatically via the trg_touch trigger.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  let body: { talentId?: string } | null = null;
  try { body = await req.json(); } catch { /* */ }
  const talentId = body?.talentId;
  if (!talentId) return NextResponse.json({ error: "talent_id_required" }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  // Ownership check — confirm the shortlist belongs to the actor before write.
  const { data: shortlist } = await admin
    .from("client_shortlists")
    .select("id, client_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!shortlist) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (shortlist.client_user_id !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Discoverable guard — same as favorites: direct-id knowledge can't
  // surface a hidden talent.
  const { data: profile } = await admin
    .from("talent_profiles")
    .select("id, is_discoverable, workflow_status")
    .eq("id", talentId)
    .maybeSingle();
  if (!profile || !profile.is_discoverable) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (profile.workflow_status !== "approved" && profile.workflow_status !== "published") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await admin
    .from("client_shortlist_items")
    .upsert(
      { shortlist_id: id, talent_profile_id: talentId },
      { onConflict: "shortlist_id,talent_profile_id" },
    );

  if (error) {
    logServerError("api.discover.shortlists.items.add", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // Step 12 telemetry — talent → shortlist is the multi-talent
  // analogue of the single-talent favorites flow. source = "shortlist"
  // so we can split funnel by which collection the talent landed in.
  await logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.inquiry_talent_added,
    payload: { talent_id: talentId, source: "shortlist", shortlist_id: id },
    userId: session.user.id,
    path: "/discover",
  });

  return NextResponse.json({ ok: true });
}
