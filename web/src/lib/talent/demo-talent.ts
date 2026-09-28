import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * Demo talents (talent_profiles.is_demo): fictional people shown as theme
 * examples. Their public site carries a Demo marker, and inquiries or
 * bookings addressed to them are refused before anything is created, so a
 * visitor can never believe they reached a real person.
 */

export const DEMO_SITE_FOOTER = {
  es: "Perfil de demostración. Las reservas están desactivadas.",
  en: "Demo profile. Bookings are simulated.",
} as const;

export const DEMO_SUBMIT_REFUSAL =
  "Este es un perfil de demostración: no recibe mensajes ni reservas reales. / This is a demo profile: it does not take real messages or bookings.";

/**
 * True when any of the given talents is a demo. Fails OPEN (false) on a read
 * error: a flag lookup must never block a real talent's inquiry.
 */
export async function anyDemoTalent(
  db: SupabaseClient,
  talentProfileIds: ReadonlyArray<string | null | undefined>,
): Promise<boolean> {
  const ids = talentProfileIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return false;
  const { data, error } = await db
    .from("talent_profiles")
    .select("id")
    .in("id", ids)
    .eq("is_demo", true)
    .limit(1);
  if (error) {
    logServerError("demoTalent.lookup", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
