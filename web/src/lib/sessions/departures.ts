/**
 * P7-05 — a departure is a session with a manifest, not a second entity.
 *
 * Tickets are `admissions` for that session. A performer fee is a payable on
 * a booking, never an admission. Vehicle/room cap stays on the capacity pool.
 */

import { logServerError } from "@/lib/server/safe-error";
import { remainingUnits } from "@/lib/capacity/remaining";
import type { CapacityAllocation, CapacityPool } from "@/lib/capacity/types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type DeparturePassenger = {
  admissionId: string;
  holderName: string | null;
  partySize: number;
  admittedCount: number;
  status: string;
};

export type DepartureManifest = {
  sessionId: string;
  tenantId: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  meetingPoint: string | null;
  passengers: DeparturePassenger[];
  remainingSeats: number | null;
  performerTalentId: string | null;
};

export function remainingDepartureSeats(
  pool: CapacityPool,
  allocations: readonly CapacityAllocation[],
  window: { startsAt: string; endsAt: string },
): number {
  return remainingUnits(pool, allocations, window);
}

export async function loadDeparture(
  admin: Admin,
  input: { tenantId: string; sessionId: string },
): Promise<
  | { ok: true; departure: DepartureManifest }
  | { ok: false; reason: "not_found" | "unavailable" | "invalid"; error: string }
> {
  if (!input.tenantId || !input.sessionId) {
    return { ok: false, reason: "invalid", error: "Missing departure." };
  }
  const { data: session, error: sessionErr } = await admin
    .from("sessions")
    .select("id, tenant_id, title, starts_at, ends_at, venue_id, offering_id")
    .eq("id", input.sessionId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (sessionErr) {
    logServerError("sessions.loadDeparture.session", sessionErr);
    return { ok: false, reason: "unavailable", error: "Could not load the departure." };
  }
  if (!session) return { ok: false, reason: "not_found", error: "That departure is gone." };
  const s = session as {
    id: string;
    tenant_id: string;
    title: string | null;
    starts_at: string;
    ends_at: string;
    venue_id: string | null;
    offering_id: string | null;
  };

  let meetingPoint: string | null = null;
  if (s.venue_id) {
    const { data: venue, error: venueErr } = await admin
      .from("venues")
      .select("name")
      .eq("id", s.venue_id)
      .maybeSingle();
    if (venueErr) logServerError("sessions.loadDeparture.venue", venueErr);
    meetingPoint = (venue as { name?: string | null } | null)?.name ?? null;
  }

  let performerTalentId: string | null = null;
  if (s.offering_id) {
    const { data: offering, error: offErr } = await admin
      .from("talent_offerings")
      .select("talent_profile_id")
      .eq("id", s.offering_id)
      .maybeSingle();
    if (offErr) logServerError("sessions.loadDeparture.offering", offErr);
    performerTalentId = (offering as { talent_profile_id?: string | null } | null)?.talent_profile_id ?? null;
  }

  const { data: admissions, error: admErr } = await admin
    .from("admissions")
    .select("id, holder_name, party_size, admitted_count, status")
    .eq("session_id", s.id)
    .eq("tenant_id", input.tenantId)
    .neq("status", "void");
  if (admErr) {
    logServerError("sessions.loadDeparture.admissions", admErr);
    return { ok: false, reason: "unavailable", error: "Could not load the manifest." };
  }
  const passengers = ((admissions ?? []) as Array<{
    id: string;
    holder_name: string | null;
    party_size: number;
    admitted_count: number;
    status: string;
  }>).map((a) => ({
    admissionId: a.id,
    holderName: a.holder_name,
    partySize: Number(a.party_size) || 1,
    admittedCount: Number(a.admitted_count) || 0,
    status: a.status,
  }));

  return {
    ok: true,
    departure: {
      sessionId: s.id,
      tenantId: s.tenant_id,
      title: s.title,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      meetingPoint,
      passengers,
      remainingSeats: null,
      performerTalentId,
    },
  };
}

/** A performer fee is a payable, never an admission on the manifest. */
export function isPerformerFee(kind: "admission" | "performer_fee"): boolean {
  return kind === "performer_fee";
}
