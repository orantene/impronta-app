// D4 slice 2 — list + create client shortlists.
//
// GET  /api/discover/shortlists                    → 200 { shortlists: DiscoverShortlist[] }
// POST /api/discover/shortlists  { name, eventDateHint?, notes? }
//                                                  → 200 { shortlist: DiscoverShortlist }
//   → 401 unauthenticated
//   → 400 missing/empty name
//
// Each shortlist response includes a flat `talentIds` array — enough for
// the picker popover to show ✓ marks next to talents already on the list
// without a per-shortlist roundtrip.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export type DiscoverShortlist = {
  id: string;
  name: string;
  eventDateHint: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  talentIds: string[];
};

export async function GET() {
  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ shortlists: [] });

  const { data, error } = await admin
    .from("client_shortlists")
    .select(
      `
      id, name, event_date_hint, notes, created_at, updated_at,
      client_shortlist_items!shortlist_id ( talent_profile_id )
      `,
    )
    .eq("client_user_id", session.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    logServerError("api.discover.shortlists.list", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  type Row = {
    id: string;
    name: string;
    event_date_hint: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    client_shortlist_items: Array<{ talent_profile_id: string }> | null;
  };

  const shortlists: DiscoverShortlist[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    eventDateHint: r.event_date_hint,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    talentIds: (r.client_shortlist_items ?? []).map((i) => i.talent_profile_id),
  }));

  return NextResponse.json({ shortlists });
}

export async function POST(req: Request) {
  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { name?: string; eventDateHint?: string | null; notes?: string | null } | null = null;
  try { body = await req.json(); } catch { /* fall through */ }

  const name = (body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const { data, error } = await admin
    .from("client_shortlists")
    .insert({
      client_user_id: session.user.id,
      name,
      event_date_hint: body?.eventDateHint || null,
      notes: body?.notes || null,
    })
    .select("id, name, event_date_hint, notes, created_at, updated_at")
    .single();

  if (error || !data) {
    logServerError("api.discover.shortlists.create", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  const shortlist: DiscoverShortlist = {
    id: data.id as string,
    name: data.name as string,
    eventDateHint: (data.event_date_hint as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    talentIds: [],
  };
  return NextResponse.json({ shortlist });
}
