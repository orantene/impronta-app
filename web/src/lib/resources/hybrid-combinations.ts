/**
 * P8-01 — remaining hybrid combinations (L54).
 *
 * Each case is several resources that must succeed together. They all go
 * through `reserveResourceSet`. Named commands exist so a missing supervisor,
 * a cafe pool, or a half-allocated breakout cannot hide inside a generic list.
 *
 *   • Supervised salon service — student + supervisor + station.
 *   • Tournament window — every court (space pool), never the cafe offering.
 *   • Breakout rooms — N rooms in one set; a taken room writes nothing.
 *   • Live recording — room + engineer + audience seats.
 *   • Exclusive space window — catering holds the kitchen so a pop-up cannot.
 *   • Retreat stay — each day's place plus optional per-day add-ons; an add-on
 *     attached later does not consume another retreat place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  reserveResourceSet,
  type ReserveResourceSetDeps,
  type ReserveResourceSetResult,
} from "@/lib/resources/reserve-set";

type Admin = Pick<SupabaseClient, "rpc" | "from">;

export async function listSpacePoolIds(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
): Promise<{ ok: true; poolIds: string[] } | { ok: false; reason: "unavailable"; error: string }> {
  const { data, error } = await admin
    .from("capacity_pools")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("subject_kind", "space");
  if (error) {
    logServerError("resources.hybrid.spacePools", error);
    return { ok: false, reason: "unavailable", error: "Could not read the courts." };
  }
  const poolIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  return { ok: true, poolIds };
}

export async function reserveSupervisedService(
  admin: Admin,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    ttlSeconds?: number | null;
    studentId: string;
    supervisorId: string;
    stationPoolId: string;
    startsAt: string;
    endsAt: string;
  },
  deps?: ReserveResourceSetDeps,
): Promise<ReserveResourceSetResult> {
  if (!input.studentId || !input.supervisorId || !input.stationPoolId) {
    return {
      ok: false,
      reason: "invalid",
      error: "A supervised service needs a student, a supervisor, and a station.",
      failedPoolId: input.stationPoolId ? null : "station",
      failedTalentId: input.studentId && input.supervisorId ? null : input.supervisorId ? "student" : "supervisor",
    };
  }
  return reserveResourceSet(
    admin,
    {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      ttlSeconds: input.ttlSeconds,
      holds: [
        { talentProfileId: input.studentId, startsAt: input.startsAt, endsAt: input.endsAt, title: "Student" },
        { talentProfileId: input.supervisorId, startsAt: input.startsAt, endsAt: input.endsAt, title: "Supervisor" },
      ],
      capacity: [{ poolId: input.stationPoolId, units: 1, startsAt: input.startsAt, endsAt: input.endsAt }],
    },
    deps,
  );
}

export async function reserveTournamentWindow(
  admin: Admin,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    ttlSeconds?: number | null;
    startsAt: string;
    endsAt: string;
    /** When omitted, every space pool for the tenant is reserved. Offerings (cafe) are not spaces. */
    courtPoolIds?: readonly string[];
  },
  deps?: ReserveResourceSetDeps,
): Promise<ReserveResourceSetResult> {
  let courtPoolIds: readonly string[];
  if (input.courtPoolIds) {
    courtPoolIds = input.courtPoolIds;
  } else {
    const listed = await listSpacePoolIds(admin, input.tenantId);
    if (!listed.ok) {
      return {
        ok: false,
        reason: "unavailable",
        error: listed.error,
        failedPoolId: null,
        failedTalentId: null,
      };
    }
    courtPoolIds = listed.poolIds;
  }
  if (courtPoolIds.length === 0) {
    return {
      ok: false,
      reason: "invalid",
      error: "A tournament needs at least one court.",
      failedPoolId: null,
      failedTalentId: null,
    };
  }
  return reserveResourceSet(
    admin,
    {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      ttlSeconds: input.ttlSeconds,
      capacity: courtPoolIds.map((poolId) => ({
        poolId,
        units: 1,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      })),
    },
    deps,
  );
}

export async function reserveBreakoutRooms(
  admin: Admin,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    ttlSeconds?: number | null;
    startsAt: string;
    endsAt: string;
    roomPoolIds: readonly string[];
    attendeePoolId?: string;
    attendeeCount?: number;
  },
  deps?: ReserveResourceSetDeps,
): Promise<ReserveResourceSetResult> {
  if (input.roomPoolIds.length === 0) {
    return {
      ok: false,
      reason: "invalid",
      error: "Pick the breakout rooms.",
      failedPoolId: null,
      failedTalentId: null,
    };
  }
  const capacity = input.roomPoolIds.map((poolId) => ({
    poolId,
    units: 1,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  }));
  if (input.attendeePoolId) {
    const units = input.attendeeCount ?? 0;
    if (!Number.isInteger(units) || units < 1) {
      return {
        ok: false,
        reason: "invalid",
        error: "Attendee count must be a positive whole number.",
        failedPoolId: input.attendeePoolId,
        failedTalentId: null,
      };
    }
    capacity.push({
      poolId: input.attendeePoolId,
      units,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
  }
  return reserveResourceSet(
    admin,
    {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      ttlSeconds: input.ttlSeconds,
      capacity,
    },
    deps,
  );
}

export async function reserveLiveRecording(
  admin: Admin,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    ttlSeconds?: number | null;
    startsAt: string;
    endsAt: string;
    engineerId: string;
    roomPoolId: string;
    audiencePoolId: string;
    audienceSeats: number;
  },
  deps?: ReserveResourceSetDeps,
): Promise<ReserveResourceSetResult> {
  if (!input.engineerId) {
    return {
      ok: false,
      reason: "invalid",
      error: "A live recording needs an engineer.",
      failedPoolId: null,
      failedTalentId: "engineer",
    };
  }
  const seats = input.audienceSeats;
  if (!Number.isInteger(seats) || seats < 1) {
    return {
      ok: false,
      reason: "invalid",
      error: "Audience seats must be a positive whole number.",
      failedPoolId: input.audiencePoolId,
      failedTalentId: null,
    };
  }
  return reserveResourceSet(
    admin,
    {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      ttlSeconds: input.ttlSeconds,
      holds: [{ talentProfileId: input.engineerId, startsAt: input.startsAt, endsAt: input.endsAt, title: "Engineer" }],
      capacity: [
        { poolId: input.roomPoolId, units: 1, startsAt: input.startsAt, endsAt: input.endsAt },
        { poolId: input.audiencePoolId, units: seats, startsAt: input.startsAt, endsAt: input.endsAt },
      ],
    },
    deps,
  );
}

export type RetreatDay = {
  startsAt: string;
  endsAt: string;
  placePoolId: string;
  addOns?: ReadonlyArray<{ poolId: string; units?: number; talentId?: string }>;
};

/** Private catering, pop-up dinner, private hire: one unit of one space for the window. */
export async function reserveExclusiveSpace(
  admin: Admin,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    ttlSeconds?: number | null;
    spacePoolId: string;
    startsAt: string;
    endsAt: string;
  },
  deps?: ReserveResourceSetDeps,
): Promise<ReserveResourceSetResult> {
  if (!input.spacePoolId) {
    return {
      ok: false,
      reason: "invalid",
      error: "Pick the room or kitchen.",
      failedPoolId: null,
      failedTalentId: null,
    };
  }
  return reserveResourceSet(
    admin,
    {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      ttlSeconds: input.ttlSeconds,
      capacity: [{ poolId: input.spacePoolId, units: 1, startsAt: input.startsAt, endsAt: input.endsAt }],
    },
    deps,
  );
}

/**
 * Multi-day retreat place. Days flatten into one set so a sold-out later day
 * does not leave earlier days held. Per-day add-ons (massage) ride the same
 * set when sold with the stay.
 */
export async function reserveRetreatStay(
  admin: Admin,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    ttlSeconds?: number | null;
    days: readonly RetreatDay[];
  },
  deps?: ReserveResourceSetDeps,
): Promise<ReserveResourceSetResult> {
  if (input.days.length === 0) {
    return {
      ok: false,
      reason: "invalid",
      error: "A retreat needs at least one day.",
      failedPoolId: null,
      failedTalentId: null,
    };
  }
  const holds = input.days.flatMap((day) =>
    (day.addOns ?? [])
      .filter((a) => a.talentId)
      .map((a) => ({
        talentProfileId: a.talentId as string,
        startsAt: day.startsAt,
        endsAt: day.endsAt,
        title: "Retreat add-on",
      })),
  );
  const capacity = input.days.flatMap((day) => [
    { poolId: day.placePoolId, units: 1, startsAt: day.startsAt, endsAt: day.endsAt },
    ...(day.addOns ?? []).map((a) => ({
      poolId: a.poolId,
      units: a.units ?? 1,
      startsAt: day.startsAt,
      endsAt: day.endsAt,
    })),
  ]);
  return reserveResourceSet(
    admin,
    {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      ttlSeconds: input.ttlSeconds,
      holds,
      capacity,
    },
    deps,
  );
}

/**
 * Optional treatment on an existing retreat. Holds only the add-on, never
 * another retreat place, so day-two massage availability is its own pool.
 */
export async function reserveRetreatAddOn(
  admin: Admin,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    ttlSeconds?: number | null;
    startsAt: string;
    endsAt: string;
    poolId: string;
    talentId?: string;
    units?: number;
  },
  deps?: ReserveResourceSetDeps,
): Promise<ReserveResourceSetResult> {
  if (!input.poolId) {
    return {
      ok: false,
      reason: "invalid",
      error: "Pick the treatment.",
      failedPoolId: null,
      failedTalentId: null,
    };
  }
  return reserveResourceSet(
    admin,
    {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      ttlSeconds: input.ttlSeconds,
      holds: input.talentId
        ? [{ talentProfileId: input.talentId, startsAt: input.startsAt, endsAt: input.endsAt, title: "Retreat add-on" }]
        : [],
      capacity: [{ poolId: input.poolId, units: input.units ?? 1, startsAt: input.startsAt, endsAt: input.endsAt }],
    },
    deps,
  );
}
