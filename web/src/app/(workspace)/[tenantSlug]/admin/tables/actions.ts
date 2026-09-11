"use server";

/**
 * The floor's writes.
 *
 * EVERY REFUSAL LEAVES HERE AS A CODE. The engine returns a `reason` plus an
 * English `error`; only the code crosses this boundary, so the floor renders
 * the workspace's language rather than whichever language the engine was
 * written in. The guard's own failures are given codes for the same reason.
 */

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { closeVisit, moveVisitToSpace, openVisit, resetTable } from "@/lib/visits/commands";
import { markReservationSeated, type SeatReservationReason } from "@/lib/visits/seat-reservation";
import {
  visitChangeServer as changeVisitServer,
  visitMergeChecks as mergeVisitChecks,
  visitSplitCheck as splitVisitCheck,
  visitTransfer as transferVisit,
} from "@/lib/visits/check-ops";

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  // The guard's `error` is an English sentence; to the floor "not signed in"
  // and "not staff here" are the same instruction, said in the host's language.
  if (!guard.ok) return { ok: false as const, reason: "not_allowed" as const };
  const allowed = await userHasCapability("view_dashboard", guard.tenantId);
  if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin };
}

export async function tablesOpenVisit(spaceId: string, serviceKind?: "table" | "tab") {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(spaceId).success) return { ok: false as const, reason: "invalid" as const };
  const r = await openVisit(g.admin, {
    tenantId: g.tenantId,
    spaceId,
    actorUserId: g.userId,
    serviceKind: serviceKind === "tab" ? "tab" : "table",
  });
  return r.ok ? { ok: true as const } : { ok: false as const, reason: r.reason };
}

const seatPartyInput = z.object({
  spaceId: uuid,
  partySize: z.number().int().min(1).max(200),
  joinedSpaceId: uuid.optional(),
  serviceKind: z.enum(["table", "tab"]).optional(),
  /** The booking this seating fulfils, when the host tapped a HELD table. */
  admissionId: uuid.optional(),
});

export type SeatPartyResult =
  | {
      ok: true;
      /**
       * The party is seated AND the booking could not be marked arrived.
       * Reported rather than swallowed: the desk will otherwise keep counting
       * these guests as late and may stamp them a no-show while they eat.
       */
      reservationWarning?: SeatReservationReason;
    }
  | { ok: false; reason: string };

/** T05/T07: seat a party (walk-in or a reservation the host is placing), refused when the table does not fit. */
export async function tablesSeatParty(input: {
  spaceId: string;
  partySize: number;
  joinedSpaceId?: string;
  serviceKind?: "table" | "tab";
  admissionId?: string;
}): Promise<SeatPartyResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = seatPartyInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const r = await openVisit(g.admin, {
    tenantId: g.tenantId,
    spaceId: parsed.data.spaceId,
    actorUserId: g.userId,
    partySize: parsed.data.partySize,
    joinedSpaceId: parsed.data.joinedSpaceId,
    serviceKind: parsed.data.serviceKind === "tab" ? "tab" : "table",
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  if (!parsed.data.admissionId) return { ok: true };

  // ORDER MATTERS. The visit exists first: if the check-in refuses, the room
  // is still correct (a table with people at it reads occupied) and only the
  // booking's own row is behind. The reverse order would admit a party to a
  // table the fit rules were about to refuse.
  const seated = await markReservationSeated(g.admin, {
    tenantId: g.tenantId,
    admissionId: parsed.data.admissionId,
    spaceIds: [parsed.data.spaceId, parsed.data.joinedSpaceId].filter((id): id is string => Boolean(id)),
    actorUserId: g.userId,
  });
  return seated.ok ? { ok: true } : { ok: true, reservationWarning: seated.reason };
}

export async function tablesCloseVisit(input: { visitId: string; expectedVersion?: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ visitId: uuid, expectedVersion: z.number().int().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  const r = await closeVisit(g.admin, { tenantId: g.tenantId, ...parsed.data });
  return r.ok ? { ok: true as const } : { ok: false as const, reason: r.reason };
}

export async function tablesMoveVisit(input: { visitId: string; spaceId: string; expectedVersion?: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ visitId: uuid, spaceId: uuid, expectedVersion: z.number().int().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  const r = await moveVisitToSpace(g.admin, { tenantId: g.tenantId, ...parsed.data });
  return r.ok ? { ok: true as const } : { ok: false as const, reason: r.reason };
}

/** T24 — clear "Needs reset" once a table has actually been bussed. */
export async function tablesResetTable(spaceId: string) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(spaceId).success) return { ok: false as const, reason: "invalid" as const };
  const r = await resetTable(g.admin, { tenantId: g.tenantId, spaceId });
  return r.ok ? { ok: true as const } : { ok: false as const, reason: r.reason };
}

export async function visitTransfer(input: {
  visitId: string;
  toSpaceId: string;
  operationKey: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    visitId: uuid,
    toSpaceId: uuid,
    operationKey: z.string().min(8).max(80),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return transferVisit(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function visitSplitCheck(input: {
  visitId: string;
  lineIds: string[];
  operationKey: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    visitId: uuid,
    lineIds: z.array(uuid).min(1),
    operationKey: z.string().min(8).max(80),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return splitVisitCheck(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function visitMergeChecks(input: {
  fromVisitId: string;
  intoVisitId: string;
  operationKey: string;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({
    fromVisitId: uuid,
    intoVisitId: uuid,
    operationKey: z.string().min(8).max(80),
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return mergeVisitChecks(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function visitChangeServer(input: { visitId: string; userId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ visitId: uuid, userId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return changeVisitServer(g.admin, { tenantId: g.tenantId, ...parsed.data });
}
