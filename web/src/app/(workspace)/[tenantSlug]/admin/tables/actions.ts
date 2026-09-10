"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { closeVisit, moveVisitToSpace, openVisit, resetTable } from "@/lib/visits/commands";

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability("view_dashboard", guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin };
}

export async function tablesOpenVisit(spaceId: string, serviceKind?: "table" | "tab") {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(spaceId).success) return { ok: false as const, error: "invalid" };
  return openVisit(g.admin, {
    tenantId: g.tenantId,
    spaceId,
    actorUserId: g.userId,
    serviceKind: serviceKind === "tab" ? "tab" : "table",
  });
}

const seatPartyInput = z.object({
  spaceId: uuid,
  partySize: z.number().int().min(1).max(200),
  joinedSpaceId: uuid.optional(),
  serviceKind: z.enum(["table", "tab"]).optional(),
});

/** T05/T07: seat a party (walk-in or a reservation the host is placing), refused when the table does not fit. */
export async function tablesSeatParty(input: {
  spaceId: string;
  partySize: number;
  joinedSpaceId?: string;
  serviceKind?: "table" | "tab";
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = seatPartyInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return openVisit(g.admin, {
    tenantId: g.tenantId,
    spaceId: parsed.data.spaceId,
    actorUserId: g.userId,
    partySize: parsed.data.partySize,
    joinedSpaceId: parsed.data.joinedSpaceId,
    serviceKind: parsed.data.serviceKind === "tab" ? "tab" : "table",
  });
}

export async function tablesCloseVisit(input: { visitId: string; expectedVersion?: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ visitId: uuid, expectedVersion: z.number().int().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return closeVisit(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

export async function tablesMoveVisit(input: { visitId: string; spaceId: string; expectedVersion?: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ visitId: uuid, spaceId: uuid, expectedVersion: z.number().int().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  return moveVisitToSpace(g.admin, { tenantId: g.tenantId, ...parsed.data });
}

/** T24 — clear "Needs reset" once a table has actually been bussed. */
export async function tablesResetTable(spaceId: string) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(spaceId).success) return { ok: false as const, error: "invalid" };
  return resetTable(g.admin, { tenantId: g.tenantId, spaceId });
}
