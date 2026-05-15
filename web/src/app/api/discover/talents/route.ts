// D2 — Discover talents endpoint (cross-tenant browse).
//
// GET /api/discover/talents?country=&category=&hub=&q=&limit=24&offset=0
//   → 200 { items: DiscoverTalentItem[], total: number, limit, offset }
//   → 401 unauthenticated
//
// Auth: any logged-in user. Discover Standard (free tier) baseline access.
// Trust-gated actions (inquire, contact) fire later — not at browse time.
//
// As of D1, this route delegates to `loadDiscoverTalents` in the workspace
// data-bridge. That loader reads from the `talent_discover_index`
// materialized view (single source of truth, refreshed every 15 min by
// /api/cron/refresh-discover-index) and surfaces the 30-day availability
// snapshot fields (nextAvailableDate / availableDaysInNext30 /
// availabilityDots14d) that D3 client cards render.
//
// See: web/docs/discover-and-unified-inquiry-2026-05-14.md §7 (engine API).

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadDiscoverTalents, type DiscoverTalentListItem }
  from "@/app/(workspace)/[tenantSlug]/_data-bridge/discover";

export const dynamic = "force-dynamic";

/** Wire-shape returned to clients. Mirrors DiscoverTalentListItem from the
 *  data-bridge — re-exported here for callers who want a stable import
 *  path scoped to the public endpoint. */
export type DiscoverTalentItem = DiscoverTalentListItem;

export async function GET(req: Request) {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "24", 10);
  const offsetRaw = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 60) : 24;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  const result = await loadDiscoverTalents({
    country: url.searchParams.get("country") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    hub: url.searchParams.get("hub") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({
    items: result.items,
    total: result.total,
    limit,
    offset,
  });
}
