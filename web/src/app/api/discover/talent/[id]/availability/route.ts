// D2 — Discover talent availability endpoint.
//
// GET /api/discover/talent/:id/availability?days=30
//   → 200 { days: DiscoverAvailabilityDay[] }
//   → 401 unauthenticated
//   → 404 not found OR talent has opted out
//
// Returns per-day availability for the next N days (default 30, max 90)
// starting from today. Each day has one status:
//
//   "booked"    — confirmed booking covers this day
//   "blocked"   — talent-authored availability block (OOO, vacation)
//   "tentative" — active hold overlaps this day (booking not yet final)
//   "open"      — none of the above (default)
//
// Priority when overlapping: booked > blocked > tentative > open. This
// powers the 14-day dot strip on the Discover card + the 30-day grid
// in the talent detail drawer. Default-off opt-in is enforced.
//
// See: web/docs/discover-and-unified-inquiry-2026-05-14.md §5 + §7.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export type DiscoverAvailabilityStatus = "open" | "tentative" | "booked" | "blocked";

export type DiscoverAvailabilityDay = {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  status: DiscoverAvailabilityStatus;
};

const DAY_MS = 86_400_000;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(startMs: number, endMs: number): string[] {
  const out: string[] = [];
  for (let t = startMs; t < endMs; t += DAY_MS) {
    out.push(toIsoDate(new Date(t)));
  }
  return out;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const daysRaw = parseInt(url.searchParams.get("days") ?? "30", 10);
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30;

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  // Confirm the talent is discoverable + approved. Opt-in enforcement.
  const { data: profile, error: profileErr } = await admin
    .from("talent_profiles")
    .select("id, is_discoverable, workflow_status, profile_kind")
    .eq("id", id)
    .maybeSingle();

  if (profileErr) {
    logServerError("api.discover.availability.profile", profileErr);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const wfOk = profile.workflow_status === "approved" || profile.workflow_status === "published";
  if (!profile.is_discoverable || !wfOk || profile.profile_kind === "resource") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Window: today at 00:00 UTC through today + days.
  const todayMs = (() => {
    const t = new Date();
    t.setUTCHours(0, 0, 0, 0);
    return t.getTime();
  })();
  const endMs = todayMs + days * DAY_MS;
  const fromIso = new Date(todayMs).toISOString();
  const toIso = new Date(endMs).toISOString();

  // Three parallel reads across the talent calendar tables.
  const [bookingsRes, holdsRes, blocksRes] = await Promise.all([
    admin
      .from("talent_bookings")
      .select("starts_at, ends_at, status")
      .eq("talent_profile_id", id)
      .lt("starts_at", toIso)
      .gte("ends_at", fromIso),
    admin
      .from("talent_holds")
      .select("starts_at, ends_at, hold_strength, expires_at")
      .eq("talent_profile_id", id)
      .lt("starts_at", toIso)
      .gte("ends_at", fromIso),
    admin
      .from("talent_availability_blocks")
      .select("starts_at, ends_at")
      .eq("talent_profile_id", id)
      .lt("starts_at", toIso)
      .gte("ends_at", fromIso),
  ]);

  if (bookingsRes.error) logServerError("api.discover.availability.bookings", bookingsRes.error);
  if (holdsRes.error) logServerError("api.discover.availability.holds", holdsRes.error);
  if (blocksRes.error) logServerError("api.discover.availability.blocks", blocksRes.error);

  // Build status map per day. Priority: booked > blocked > tentative > open.
  const statusByDay = new Map<string, DiscoverAvailabilityStatus>();

  const apply = (
    startsAt: string,
    endsAt: string,
    candidate: DiscoverAvailabilityStatus,
  ) => {
    const startMs = Math.max(new Date(startsAt).getTime(), todayMs);
    const endRangeMs = Math.min(new Date(endsAt).getTime(), endMs);
    if (endRangeMs <= startMs) return;
    const priority: Record<DiscoverAvailabilityStatus, number> = {
      booked: 4, blocked: 3, tentative: 2, open: 1,
    };
    for (const isoDate of daysBetween(startMs, endRangeMs)) {
      const current = statusByDay.get(isoDate);
      if (!current || priority[candidate] > priority[current]) {
        statusByDay.set(isoDate, candidate);
      }
    }
  };

  for (const b of (bookingsRes.data ?? []) as Array<{ starts_at: string; ends_at: string; status: string }>) {
    if (b.status === "cancelled") continue;
    apply(b.starts_at, b.ends_at, "booked");
  }
  const nowIso = new Date().toISOString();
  for (const h of (holdsRes.data ?? []) as Array<{ starts_at: string; ends_at: string; hold_strength: string; expires_at: string | null }>) {
    if (h.expires_at && h.expires_at < nowIso) continue;
    apply(h.starts_at, h.ends_at, "tentative");
  }
  for (const bl of (blocksRes.data ?? []) as Array<{ starts_at: string; ends_at: string }>) {
    apply(bl.starts_at, bl.ends_at, "blocked");
  }

  const dayList = daysBetween(todayMs, endMs);
  const out: DiscoverAvailabilityDay[] = dayList.map((date) => ({
    date,
    status: statusByDay.get(date) ?? "open",
  }));

  return NextResponse.json({ days: out });
}
