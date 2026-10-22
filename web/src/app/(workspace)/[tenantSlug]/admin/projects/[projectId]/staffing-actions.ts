"use server";

/**
 * TUL-1373: the Team tab's staffing picker doors. Hold the picked people's dates, or release a hold.
 * Role scope (the TUL-1708 memo): holding or releasing writes to a person's calendar, so it takes the same
 * capability as the calendar hold actions, `agency.roster.edit` (editor and above). A viewer is refused.
 * Refusals come back as reason codes; the screen maps them to translated copy.
 */
import { z } from "zod";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { holdTalentsForProject, releaseProjectHold, type HoldTalentsResult } from "@/lib/projects/project-holds.server";

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction({ capability: "agency.roster.edit" });
  if (!guard.ok) return { ok: false as const, reason: "not_allowed" as const };
  if (!(await userHasCapability("agency.roster.edit", guard.tenantId))) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin };
}

export async function holdTalentsForProjectAction(input: {
  bookingId: string;
  talentProfileIds: string[];
}): Promise<HoldTalentsResult | { ok: false; reason: "not_allowed" | "invalid" }> {
  await requireNotImpersonating();
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ bookingId: uuid, talentProfileIds: z.array(uuid).max(50) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return holdTalentsForProject(g.admin, { tenantId: g.tenantId, userId: g.userId, ...parsed.data });
}

export async function releaseProjectHoldAction(input: {
  bookingId: string;
  holdId: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_allowed" | "invalid" | "not_found" | "unavailable" }> {
  await requireNotImpersonating();
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ bookingId: uuid, holdId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return releaseProjectHold(g.admin, { tenantId: g.tenantId, ...parsed.data });
}
