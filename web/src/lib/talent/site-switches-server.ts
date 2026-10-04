/**
 * WSF-C — THE server loader for the talent_sites switches and the
 * working-hours half of instant readiness. Not "server-only" so the DI cores
 * can run under node:test; it only reads through the client it is handed.
 *
 * A read error fails OPEN (all switches on, readiness unknown): absence never
 * pauses a talent, and an unknown readiness never downgrades a service.
 */
import { logServerError } from "@/lib/server/safe-error";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { hoursHaveOpenWindow } from "@/lib/scheduling/public-slots";
import { parseTalentSiteSwitches, type TalentSiteSwitches } from "@/lib/talent/site-switches";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reader = { from: (table: string) => any };

const SWITCH_COLUMNS = "talent_profile_id, accepting_bookings, accepting_inquiries, chat_enabled, chat_config";

export async function loadTalentSiteSwitchesMany(
  admin: Reader,
  talentProfileIds: readonly string[],
): Promise<Map<string, TalentSiteSwitches>> {
  const ids = [...new Set(talentProfileIds.filter(Boolean))];
  const out = new Map<string, TalentSiteSwitches>();
  for (const id of ids) out.set(id, parseTalentSiteSwitches(null));
  if (ids.length === 0) return out;
  try {
    const { data, error } = await admin.from("talent_sites").select(SWITCH_COLUMNS).in("talent_profile_id", ids);
    if (error) {
      logServerError("talent.siteSwitches.load", error);
      return out;
    }
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const id = typeof row.talent_profile_id === "string" ? row.talent_profile_id : null;
      if (id) out.set(id, parseTalentSiteSwitches(row));
    }
  } catch (err) {
    logServerError("talent.siteSwitches.load", err);
  }
  return out;
}

export async function loadTalentSiteSwitches(admin: Reader, talentProfileId: string): Promise<TalentSiteSwitches> {
  const map = await loadTalentSiteSwitchesMany(admin, [talentProfileId]);
  return map.get(talentProfileId) ?? parseTalentSiteSwitches(null);
}

/** Does this hours row have at least one open window? */
export function hoursRowHasWorkingHours(row: unknown): boolean {
  if (!row) return false;
  const parsed = parseBookingHours(row);
  return !!parsed && hoursHaveOpenWindow(parsed);
}

/**
 * Per talent: true / false when the hours row was read, absent from the map
 * when the read failed (readiness unknown, never downgrade).
 */
export async function loadWorkingHoursPresence(
  admin: Reader,
  talentProfileIds: readonly string[],
): Promise<Map<string, boolean>> {
  const ids = [...new Set(talentProfileIds.filter(Boolean))];
  const out = new Map<string, boolean>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await admin
      .from("talent_booking_hours")
      .select("talent_profile_id, timezone, weekly, exceptions, slot_minutes, horizon_days")
      .in("talent_profile_id", ids);
    if (error) {
      logServerError("talent.readiness.hours", error);
      return out;
    }
    for (const id of ids) out.set(id, false);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const id = typeof row.talent_profile_id === "string" ? row.talent_profile_id : null;
      if (id) out.set(id, hoursRowHasWorkingHours(row));
    }
  } catch (err) {
    logServerError("talent.readiness.hours", err);
  }
  return out;
}
