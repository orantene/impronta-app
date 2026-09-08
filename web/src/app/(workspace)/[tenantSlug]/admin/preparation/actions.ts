"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { acknowledgeTicket, markTicketReady, recordHandoff } from "@/lib/preparation/tickets";

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability("view_dashboard", guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };
  return { ok: true as const, tenantId: guard.tenantId, admin };
}

export async function prepAcknowledge(ticketId: string) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(ticketId).success) return { ok: false as const, error: "invalid" };
  return acknowledgeTicket(g.admin, { tenantId: g.tenantId, ticketId });
}

export async function prepReady(ticketId: string) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(ticketId).success) return { ok: false as const, error: "invalid" };
  return markTicketReady(g.admin, { tenantId: g.tenantId, ticketId });
}

export async function prepHandoff(ticketId: string) {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(ticketId).success) return { ok: false as const, error: "invalid" };
  return recordHandoff(g.admin, { tenantId: g.tenantId, ticketId });
}
