import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/admin";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import {
  buildTalentPresenceStats,
  type TalentPresenceStats,
} from "@/lib/analytics/talent-presence-stats";

type Db = NonNullable<ReturnType<typeof createServiceRoleClient>>;

const SCAN_LIMIT = 5000;
const NOT_REAL_INQUIRY = ["draft", "rejected", "expired", "closed_lost"];
const CONFIRMED_BOOKING = ["confirmed", "in_progress", "completed"];

function dayStartIso(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * TUL-582: last-30 vs prior-30 presence stats for ONE talent profile, from
 * already-collected data only. Caller has already authorized `talentProfileId`.
 * Best-effort: a failed read yields zeros for that metric, never a throw.
 */
export async function loadTalentPresenceStats(
  supabase: Db,
  talentProfileId: string,
): Promise<TalentPresenceStats> {
  const start30Iso = dayStartIso(30);
  const start60Iso = dayStartIso(60);

  const [viewsRes, inqRes, bookRes] = await Promise.all([
    supabase
      .from("analytics_events")
      .select("created_at, payload")
      .eq("talent_id", talentProfileId)
      .eq("name", PRODUCT_ANALYTICS_EVENTS.view_talent_profile)
      .gte("created_at", start60Iso)
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT),
    supabase
      .from("inquiry_participants")
      .select("inquiries!inner(created_at, status)")
      .eq("talent_profile_id", talentProfileId)
      .eq("role", "talent")
      .neq("status", "removed")
      .gte("inquiries.created_at", start60Iso)
      .limit(SCAN_LIMIT),
    supabase
      .from("booking_talent")
      .select("agency_bookings!inner(created_at, status)")
      .eq("talent_profile_id", talentProfileId)
      .in("agency_bookings.status", CONFIRMED_BOOKING)
      .gte("agency_bookings.created_at", start60Iso)
      .limit(SCAN_LIMIT),
  ]);

  const views = viewsRes.error
    ? []
    : ((viewsRes.data ?? []) as unknown as Array<{
        created_at: string;
        payload: Record<string, unknown> | null;
      }>);

  type Joined<K extends string> = Array<
    Record<K, { created_at: string; status: string | null } | null>
  >;
  const requests = inqRes.error
    ? []
    : ((inqRes.data ?? []) as unknown as Joined<"inquiries">)
        .map((r) => r.inquiries)
        .filter(
          (i): i is { created_at: string; status: string | null } =>
            i != null && !NOT_REAL_INQUIRY.includes(i.status ?? ""),
        )
        .map((i) => ({ created_at: i.created_at }));
  const confirmed = bookRes.error
    ? []
    : ((bookRes.data ?? []) as unknown as Joined<"agency_bookings">)
        .map((r) => r.agency_bookings)
        .filter(
          (b): b is { created_at: string; status: string | null } => b != null,
        )
        .map((b) => ({ created_at: b.created_at }));

  return buildTalentPresenceStats({
    start30Iso,
    start60Iso,
    views,
    requests,
    confirmed,
  });
}
