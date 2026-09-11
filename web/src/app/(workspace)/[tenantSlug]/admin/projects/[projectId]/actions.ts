"use server";

/**
 * W47 — deciding on a deliverable.
 *
 * THE ENGINE ALREADY EXISTS. `lib/bookings/deliverables.ts` owns the state
 * machine and the revision-limit rule; this file is the door onto it: staff
 * guard, capability, uuid shape, then hand over. It adds no rule of its own,
 * because a second copy of "may this take another revision" is a second answer.
 *
 * EVERY REFUSAL COMES BACK AS A REASON CODE, NOT A SENTENCE. The caller maps
 * the code to translated copy. Returning the engine's English `error` straight
 * to the screen is how a Spanish operator ends up reading "Further revisions
 * are chargeable."
 */

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { approveDeliverable, createDeliverable, requestRevision } from "@/lib/bookings/deliverables";

const uuid = z.string().uuid();

export type MilestoneDecisionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid" | "not_allowed" | "unavailable" | "not_found" | "limit_reached";
    };

async function guard() {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false as const, reason: "not_allowed" as const };
  const allowed = await userHasCapability("view_dashboard", staff.tenantId);
  if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: staff.tenantId, admin };
}

export async function approveProjectDeliverable(
  deliverableId: string,
): Promise<MilestoneDecisionResult> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(deliverableId).success) return { ok: false, reason: "invalid" };
  const result = await approveDeliverable(g.admin, { tenantId: g.tenantId, deliverableId });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function requestProjectDeliverableRevision(
  deliverableId: string,
): Promise<MilestoneDecisionResult> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(deliverableId).success) return { ok: false, reason: "invalid" };
  const result = await requestRevision(g.admin, { tenantId: g.tenantId, deliverableId });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * W47 `Add milestone`: one `booking_deliverables` row in `draft` through the
 * engine's own `createDeliverable`. The amount and the file are set on the
 * row afterwards (Package 2's writers); the title and the due date are the
 * two things a milestone is born with.
 */
export async function addProjectMilestone(input: {
  bookingId: string;
  title: string;
  dueAt: string | null;
}): Promise<MilestoneDecisionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const parsed = z
    .object({
      bookingId: uuid,
      title: z.string().trim().min(1).max(200),
      dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const result = await createDeliverable(g.admin, {
    tenantId: g.tenantId,
    bookingId: parsed.data.bookingId,
    title: parsed.data.title,
    dueAt: parsed.data.dueAt ? `${parsed.data.dueAt}T12:00:00Z` : null,
  });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
