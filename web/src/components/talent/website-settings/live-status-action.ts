"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import {
  emergenciesOn,
  isValidTimeZone,
  loadTalentLiveStatus,
  saveTalentEmergencies,
} from "@/lib/talent/live-status";

export type LiveStatusSnapshot = { emergenciesOn: boolean; emergenciesUntil: string | null };

async function hoursTimeZone(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  talentProfileId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("talent_booking_hours")
    .select("timezone")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  const tz = (data as { timezone?: unknown } | null)?.timezone;
  return isValidTimeZone(tz) ? tz : null;
}

/** Live status for the signed-in talent. null when unavailable. */
export async function loadLiveStatusAction(): Promise<LiveStatusSnapshot | null> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const status = await loadTalentLiveStatus(admin, scope.talentProfile.id);
  return { emergenciesOn: emergenciesOn(status), emergenciesUntil: status.emergenciesUntil };
}

/**
 * Toggle "Atiendo emergencias hoy" for the signed-in talent. On expires at the
 * end of her local day: her booking-hours zone, else the browser zone the
 * client sent, else UTC (which ends the day early for the Americas, never late).
 */
export async function setEmergenciesTodayAction(
  on: boolean,
  browserTimeZone?: string,
): Promise<{ ok: true; status: LiveStatusSnapshot } | { ok: false; error: string }> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return { ok: false, error: "forbidden" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "unavailable" };
  const id = scope.talentProfile.id;
  const timeZone = (await hoursTimeZone(admin, id)) ?? (isValidTimeZone(browserTimeZone) ? browserTimeZone : null);
  const now = new Date();
  const res = await saveTalentEmergencies(admin, {
    talentProfileId: id,
    userId: scope.session.user.id,
    on: on === true,
    now,
    timeZone,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    status: { emergenciesOn: emergenciesOn(res.status, now), emergenciesUntil: res.status.emergenciesUntil },
  };
}
