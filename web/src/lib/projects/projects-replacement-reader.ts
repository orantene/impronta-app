import "server-only";

/**
 * W48: the replacement picker's reader (split out of projects-reader.ts for the 800-line limit;
 * projects-reader re-exports it, so importers are unchanged).
 */
import { availabilityByTalent, type Availability, type BusyRow } from "@/lib/coordinator/replacement-availability";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { ReadFailure } from "./projects-reader";

export type ReplacementCandidate = {
  readonly talentProfileId: string;
  readonly name: string;
  /** Free / busy for the job's window; unknown when it could not be checked (never "free"). */
  readonly availability: Availability;
  /** 0 to 5, or null when the person has no reviews yet. */
  readonly rating: number | null;
};

export type ReplacementCandidatesLoad =
  | { readonly ok: true; readonly candidates: readonly ReplacementCandidate[] }
  | ReadFailure;

/**
 * The workspace's own roster, every person on it in any non-removed state:
 * the list the W48 replacement picker draws from. Whether the person is FREE
 * at the job's time is the engine's answer (`project_replace_talent` refuses
 * `talent_unavailable`), not this reader's guess.
 */
export async function loadReplacementCandidates(
  tenantId: string,
  window: { startsAt: string | null; endsAt: string | null } | null = null,
): Promise<ReplacementCandidatesLoad> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  const { data: roster, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .neq("status", "removed");
  if (rosterErr) {
    logServerError("projects.loadReplacementCandidates/roster", rosterErr);
    return { ok: false, reason: "unavailable" };
  }
  const ids = [...new Set(((roster ?? []) as Array<{ talent_profile_id: string }>).map((r) => r.talent_profile_id))];
  if (ids.length === 0) return { ok: true, candidates: [] };
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, display_name, first_name, last_name, rating_avg, rating_count")
    .in("id", ids)
    .eq("profile_kind", "person");
  if (error) {
    logServerError("projects.loadReplacementCandidates/profiles", error);
    return { ok: false, reason: "unavailable" };
  }
  const rows = (data ?? []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null; rating_avg: number | string | null; rating_count: number | null }>;

  // Who is free for the job. A failed read marks everyone UNKNOWN, never free; the engine
  // (`project_replace_talent`) stays the authority and still refuses `talent_unavailable`.
  const win = window && window.startsAt && window.endsAt ? { startsAt: window.startsAt, endsAt: window.endsAt } : null;
  let busy: BusyRow[] | "unreadable" = [];
  if (win) {
    const q = (table: string, cols: string) =>
      admin.from(table).select(cols).in("talent_profile_id", rows.map((r) => r.id)).lt("starts_at", win.endsAt).gt("ends_at", win.startsAt);
    const [holds, bookings, blocks] = await Promise.all([
      q("talent_holds", "talent_profile_id, starts_at, ends_at, expires_at"),
      q("talent_bookings", "talent_profile_id, starts_at, ends_at, status"),
      q("talent_availability_blocks", "talent_profile_id, starts_at, ends_at"),
    ]);
    const err = holds.error ?? bookings.error ?? blocks.error;
    if (err) {
      logServerError("projects.loadReplacementCandidates/busy", err);
      busy = "unreadable";
    } else {
      const now = Date.now();
      const toBusy = (r: Record<string, unknown>): BusyRow => ({ talentProfileId: String(r.talent_profile_id), startsAt: String(r.starts_at), endsAt: String(r.ends_at) });
      busy = [
        ...((holds.data ?? []) as unknown as Array<Record<string, unknown>>)
          .filter((r) => !r.expires_at || Date.parse(String(r.expires_at)) > now)
          .map(toBusy),
        ...((bookings.data ?? []) as unknown as Array<Record<string, unknown>>).filter((r) => r.status !== "cancelled").map(toBusy),
        ...((blocks.data ?? []) as unknown as Array<Record<string, unknown>>).map(toBusy),
      ];
    }
  }
  const availability = availabilityByTalent(rows.map((r) => r.id), win, busy);

  const rank = { free: 0, unknown: 1, busy: 2 } as const;
  const candidates: ReplacementCandidate[] = rows
    .map((row) => {
      const avg = Number(row.rating_avg);
      return {
        talentProfileId: row.id,
        name: (row.display_name ?? `${row.first_name ?? ""} ${row.last_name ?? ""}`).trim(),
        availability: availability.get(row.id) ?? "unknown",
        rating: (row.rating_count ?? 0) > 0 && Number.isFinite(avg) ? avg : null,
      };
    })
    .filter((c) => c.name.length > 0)
    // Free first, then unknown, then busy; best rated first (no rating last); name breaks ties.
    .sort(
      (a, b) =>
        rank[a.availability] - rank[b.availability] ||
        (b.rating ?? -1) - (a.rating ?? -1) ||
        a.name.localeCompare(b.name),
    );
  return { ok: true, candidates };
}
