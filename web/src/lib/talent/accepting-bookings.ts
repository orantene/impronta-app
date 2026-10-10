"use server";

/**
 * TUL-538 — one-click "accepting new bookings" for the talent Today banner
 * and Disponibilidad drawer. Not gated by the Website Settings dark-launch
 * flag (that flag only covers the settings screen).
 */

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";

export type SetAcceptingBookingsResult =
  | { ok: true; acceptingBookings: boolean }
  | { ok: false; error: string };

/** Flip `talent_sites.accepting_bookings` for the signed-in talent. */
export async function setTalentAcceptingBookingsAction(
  accepting: boolean,
): Promise<SetAcceptingBookingsResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const scope = await requireTalentSelf();
  if (!scope.ok) return { ok: false, error: "forbidden" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "unavailable" };

  const id = scope.talentProfile.id;
  const next = accepting === true;
  const { data: existing, error: readErr } = await admin
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", id)
    .maybeSingle();
  if (readErr) {
    logServerError("talent.acceptingBookings.read", readErr);
    return { ok: false, error: "read_failed" };
  }

  const { error } = existing
    ? await admin.from("talent_sites").update({ accepting_bookings: next }).eq("talent_profile_id", id)
    : await admin.from("talent_sites").insert({
        talent_profile_id: id,
        accepting_bookings: next,
        accepting_inquiries: true,
        chat_enabled: true,
      });
  if (error) {
    logServerError("talent.acceptingBookings.write", error);
    return { ok: false, error: "write_failed" };
  }

  const switches = await loadTalentSiteSwitches(admin, id);
  return { ok: true, acceptingBookings: switches.acceptingBookings };
}
