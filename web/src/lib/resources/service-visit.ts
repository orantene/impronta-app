/**
 * P7-03 — a mobile visit must sit inside a talent's service area.
 *
 * `talent_service_areas` is already canonical. This command only decides
 * whether a visit location is allowed. It does not invent a parallel area table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export type ServiceVisitFitResult =
  | { ok: true; mode: "remote" | "at_location" }
  | { ok: false; reason: "out_of_area" | "unavailable" | "invalid"; error: string };

export async function visitFitsServiceArea(
  admin: Pick<SupabaseClient, "from">,
  input: { talentProfileId: string; locationId?: string | null },
): Promise<ServiceVisitFitResult> {
  if (!input.talentProfileId) {
    return { ok: false, reason: "invalid", error: "Missing professional." };
  }
  const { data, error } = await admin
    .from("talent_service_areas")
    .select("location_id, service_kind")
    .eq("talent_profile_id", input.talentProfileId);
  if (error) {
    logServerError("resources.visitFitsServiceArea", error);
    return { ok: false, reason: "unavailable", error: "Could not read service areas." };
  }
  const rows = (data ?? []) as Array<{ location_id: string | null; service_kind: string }>;
  if (rows.some((r) => r.service_kind === "remote_only") && !input.locationId) {
    return { ok: true, mode: "remote" };
  }
  if (!input.locationId) {
    return { ok: false, reason: "invalid", error: "A visit needs an address." };
  }
  const allowed = rows.some(
    (r) =>
      (r.service_kind === "home_base" || r.service_kind === "travel_to") &&
      r.location_id === input.locationId,
  );
  if (!allowed) {
    return { ok: false, reason: "out_of_area", error: "That address is outside the service area." };
  }
  return { ok: true, mode: "at_location" };
}
