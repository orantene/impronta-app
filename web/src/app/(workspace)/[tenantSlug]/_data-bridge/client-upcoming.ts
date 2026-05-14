/**
 * Client upcoming bookings loader — day-of + this-week surface.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §11 (day-of)
 * Plan: web/docs/client-execution-plan-2026-05-14.md §23 Phase F
 *
 * Returns rich upcoming-booking rows scoped to the next 14 days, with
 * client-safe day-of metadata (coordinator name + phone, talent
 * confirmed list, venue + map link). Used by the Today priority card
 * and the CallSheetDrawer.
 *
 * Permission boundary: coordinator's phone IS surfaced (intentional —
 * the client needs to reach them on event day). Talent private rates +
 * coordinator fee + commission internals are not selected.
 */

import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type UpcomingTalentRow = {
  participant_id: string;
  talent_profile_id: string | null;
  name: string;
  status: string;
};

export type UpcomingBooking = {
  inquiry_id: string;
  event_date: string; // YYYY-MM-DD
  start_time: string | null;
  duration: string | null;
  /** Title rendered on the card (job_name from interpreted_query or company). */
  title: string;
  venue_name: string | null;
  city: string | null;
  google_maps_url: string | null;
  /** Free-form notes from the brief (logistics, parking, etc.). */
  notes: string | null;
  coordinator: {
    name: string | null;
    phone: string | null;
    user_id: string;
  } | null;
  talent: UpcomingTalentRow[];
  /** Bucket — exact-today vs the next ~13 days. */
  bucket: "today" | "this_week" | "later";
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(iso: string): string {
  // YYYY-MM-DD (UTC) — comparison key for "is today"
  return new Date(iso).toISOString().slice(0, 10);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Load the client's confirmed bookings in the next 14 days. Returns
 * rich enough data for the Today priority card + the call-sheet
 * drawer. Sorted by event_date ascending.
 */
export async function loadClientUpcoming(
  userId: string,
  tenantId: string,
): Promise<UpcomingBooking[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const admin = createServiceRoleClient();
    const readClient = admin ?? supabase;

    const now = new Date();
    const start = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const end = new Date(now.getTime() + 14 * ONE_DAY_MS).toISOString().slice(0, 10);

    // Fetch inquiries in booked/coordination/offer_pending/approved
    // states with an event_date in the window. Coordination + offer_pending
    // are included so the Today card can fire for "imminent but not yet
    // contractually booked" projects too.
    const { data: rows, error } = await supabase
      .from("inquiries")
      .select(
        `id, event_date, event_location, company, message, status,
         interpreted_query, coordinator_id`,
      )
      .eq("tenant_id", tenantId)
      .eq("client_user_id", userId)
      .in("status", ["submitted", "coordination", "offer_pending", "approved", "booked", "converted"])
      .gte("event_date", start)
      .lte("event_date", end)
      .order("event_date", { ascending: true });

    if (error) {
      logServerError("client.loadUpcoming", error);
      return [];
    }
    if (!rows || rows.length === 0) return [];

    // Resolve coordinator profiles + per-inquiry talent in parallel.
    const inquiryIds = rows.map((r) => (r as { id: string }).id);
    const coordIds = [
      ...new Set(
        rows
          .map((r) => (r as { coordinator_id: string | null }).coordinator_id)
          .filter(Boolean) as string[],
      ),
    ];
    const [coordRes, partsRes] = await Promise.all([
      coordIds.length > 0
        ? readClient
            .from("profiles")
            .select("id, display_name, phone")
            .in("id", coordIds)
        : Promise.resolve({ data: [], error: null }),
      readClient
        .from("inquiry_participants")
        .select(
          `id, inquiry_id, talent_profile_id, status,
           talent_profiles!talent_profile_id ( display_name, first_name, last_name )`,
        )
        .in("inquiry_id", inquiryIds)
        .eq("tenant_id", tenantId)
        .eq("role", "talent")
        .neq("status", "removed"),
    ]);

    type CoordRow = { id: string; display_name: string | null; phone: string | null };
    type PartRow = {
      id: string;
      inquiry_id: string;
      talent_profile_id: string | null;
      status: string;
      talent_profiles: { display_name: string | null; first_name: string | null; last_name: string | null } | null;
    };

    const coordMap = new Map<string, CoordRow>();
    for (const c of ((coordRes.data ?? []) as CoordRow[])) coordMap.set(c.id, c);

    const talentByInquiry = new Map<string, UpcomingTalentRow[]>();
    for (const p of ((partsRes.data ?? []) as unknown as PartRow[])) {
      const name =
        p.talent_profiles?.display_name?.trim()
        || `${p.talent_profiles?.first_name ?? ""} ${p.talent_profiles?.last_name ?? ""}`.trim()
        || "Unnamed talent";
      const list = talentByInquiry.get(p.inquiry_id) ?? [];
      list.push({
        participant_id: p.id,
        talent_profile_id: p.talent_profile_id,
        name,
        status: p.status,
      });
      talentByInquiry.set(p.inquiry_id, list);
    }

    const today = todayKey();
    const oneWeekOut = new Date(now.getTime() + 7 * ONE_DAY_MS).toISOString().slice(0, 10);

    return rows
      .map((r) => {
        const row = r as {
          id: string;
          event_date: string;
          event_location: string | null;
          company: string | null;
          message: string | null;
          status: string;
          interpreted_query: Record<string, unknown> | null;
          coordinator_id: string | null;
        };
        const iq = (row.interpreted_query ?? {}) as {
          client?: { job_name?: string };
          location?: { venue_name?: string; city?: string; google_maps_url?: string };
          date?: { start_time?: string; duration?: string };
          brief?: { special_requirements?: string };
        };
        const coord = row.coordinator_id ? coordMap.get(row.coordinator_id) : null;
        const eventDateKey = dateKey(row.event_date);
        const bucket: UpcomingBooking["bucket"] =
          eventDateKey === today
            ? "today"
            : eventDateKey <= oneWeekOut
              ? "this_week"
              : "later";

        return {
          inquiry_id: row.id,
          event_date: row.event_date,
          start_time: iq.date?.start_time ?? null,
          duration: iq.date?.duration ?? null,
          title:
            iq.client?.job_name?.trim()
            || row.company
            || row.message?.split("\n")[0]?.slice(0, 60)
            || "Booking",
          venue_name: iq.location?.venue_name ?? null,
          city: iq.location?.city ?? row.event_location ?? null,
          google_maps_url: iq.location?.google_maps_url ?? null,
          notes: iq.brief?.special_requirements ?? null,
          coordinator: coord
            ? { name: coord.display_name, phone: coord.phone, user_id: coord.id }
            : null,
          talent: talentByInquiry.get(row.id) ?? [],
          bucket,
        };
      })
      .filter((b): b is UpcomingBooking => true);
  } catch (err) {
    logServerError("client.loadUpcoming", err);
    return [];
  }
}
