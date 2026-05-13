import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Talent calendar — Phase B.3.
 *
 * Three data sources unified into one calendar event stream:
 *   - talent_bookings              confirmed work
 *   - talent_holds                 tentative reservations
 *   - talent_availability_blocks   talent-authored OOO/personal blocks
 *
 * The loader returns a single sorted stream keyed by entry_kind so the UI
 * can render each with appropriate styling without three queries.
 */

export type TalentCalendarEntryKind = "booking" | "hold" | "block";

export type TalentCalendarEntry = {
  id: string;
  kind: TalentCalendarEntryKind;
  /** Display title — booking title / hold title / block reason. */
  title: string;
  /** Optional sub-label — client or tenant context. */
  subLabel: string | null;
  /** Half-open [startsAt, endsAt). */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  /** Booking lifecycle (only meaningful for kind='booking'). */
  status: "confirmed" | "completed" | "cancelled" | null;
  /** Hold strength (only meaningful for kind='hold'). */
  holdStrength: "soft" | "firm" | null;
  /** Inquiry link when this entry came from the inquiry flow. */
  inquiryId: string | null;
  /** Tenant that owns this entry (for multi-agency talents). */
  tenantId: string | null;
};

/**
 * Load all calendar entries for a talent within a date window.
 * Defaults to a 12-month window centred on now.
 */
export async function loadTalentCalendarEntries(
  talentProfileId: string,
  opts?: { fromIso?: string; toIso?: string },
): Promise<TalentCalendarEntry[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const now = Date.now();
    const month = 30 * 86_400_000;
    const fromIso = opts?.fromIso ?? new Date(now - 3 * month).toISOString();
    const toIso = opts?.toIso ?? new Date(now + 9 * month).toISOString();

    const [bookingsRes, holdsRes, blocksRes] = await Promise.all([
      supabase
        .from("talent_bookings")
        .select(
          "id, title, client_label, starts_at, ends_at, all_day, status, inquiry_id, tenant_id",
        )
        .eq("talent_profile_id", talentProfileId)
        .gte("starts_at", fromIso)
        .lt("starts_at", toIso),
      supabase
        .from("talent_holds")
        .select(
          "id, title, client_label, starts_at, ends_at, all_day, hold_strength, inquiry_id, tenant_id, expires_at",
        )
        .eq("talent_profile_id", talentProfileId)
        .gte("starts_at", fromIso)
        .lt("starts_at", toIso),
      supabase
        .from("talent_availability_blocks")
        .select("id, reason, note, starts_at, ends_at, all_day")
        .eq("talent_profile_id", talentProfileId)
        .gte("starts_at", fromIso)
        .lt("starts_at", toIso),
    ]);

    if (bookingsRes.error) logServerError("talent-calendar.bookings", bookingsRes.error);
    if (holdsRes.error) logServerError("talent-calendar.holds", holdsRes.error);
    if (blocksRes.error) logServerError("talent-calendar.blocks", blocksRes.error);

    const out: TalentCalendarEntry[] = [];

    for (const b of (bookingsRes.data ?? []) as Array<{
      id: string;
      title: string;
      client_label: string | null;
      starts_at: string;
      ends_at: string;
      all_day: boolean;
      status: "confirmed" | "completed" | "cancelled";
      inquiry_id: string | null;
      tenant_id: string | null;
    }>) {
      // Hide cancelled bookings from the default calendar view.
      if (b.status === "cancelled") continue;
      out.push({
        id: b.id,
        kind: "booking",
        title: b.title,
        subLabel: b.client_label,
        startsAt: b.starts_at,
        endsAt: b.ends_at,
        allDay: b.all_day,
        status: b.status,
        holdStrength: null,
        inquiryId: b.inquiry_id,
        tenantId: b.tenant_id,
      });
    }

    const nowIso = new Date().toISOString();
    for (const h of (holdsRes.data ?? []) as Array<{
      id: string;
      title: string;
      client_label: string | null;
      starts_at: string;
      ends_at: string;
      all_day: boolean;
      hold_strength: "soft" | "firm";
      inquiry_id: string | null;
      tenant_id: string | null;
      expires_at: string | null;
    }>) {
      // Skip expired holds.
      if (h.expires_at && h.expires_at < nowIso) continue;
      out.push({
        id: h.id,
        kind: "hold",
        title: h.title,
        subLabel: h.client_label,
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        allDay: h.all_day,
        status: null,
        holdStrength: h.hold_strength,
        inquiryId: h.inquiry_id,
        tenantId: h.tenant_id,
      });
    }

    for (const blk of (blocksRes.data ?? []) as Array<{
      id: string;
      reason: string;
      note: string | null;
      starts_at: string;
      ends_at: string;
      all_day: boolean;
    }>) {
      out.push({
        id: blk.id,
        kind: "block",
        title: blk.reason,
        subLabel: blk.note,
        startsAt: blk.starts_at,
        endsAt: blk.ends_at,
        allDay: blk.all_day,
        status: null,
        holdStrength: null,
        inquiryId: null,
        tenantId: null,
      });
    }

    out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return out;
  } catch (err) {
    logServerError("talent-calendar.load", err);
    return [];
  }
}
