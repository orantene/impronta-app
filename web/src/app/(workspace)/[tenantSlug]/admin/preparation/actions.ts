"use server";

/**
 * T26 — the kitchen/pickup station's three writes.
 *
 * EVERY REFUSAL LEAVES HERE AS A CODE, NEVER AS A SENTENCE. The engine
 * (`lib/preparation/tickets.ts`) returns both a `reason` and an English
 * `error`; only the `reason` crosses this boundary, because the station board
 * renders in the workspace's locale and an English sentence baked into a
 * server action is a screen that is English in every language. The guard's own
 * refusals are given the same shape for the same reason: a caller who is not
 * staff must read "You do not have permission to do that." in their language,
 * not the literal token `not_allowed` in a red box.
 */

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { acknowledgeTicket, markTicketReady, recordHandoff } from "@/lib/preparation/tickets";

const uuid = z.string().uuid();

/**
 * The codes the board knows how to say in words. Every action below returns
 * one of these and nothing else; `PreparationCopy.refusal` has an entry for
 * each, and a render test proves all three languages carry all of them.
 */
export type PrepRefusalReason =
  | "not_found"
  | "wrong_tenant"
  | "invalid_state"
  | "invalid"
  | "not_allowed"
  | "unavailable";

export type PrepActionResult = { ok: true; ticketId: string } | { ok: false; reason: PrepRefusalReason };

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  // The guard's `error` is an English sentence. It is deliberately dropped:
  // "not signed in" and "not staff here" are both, to a station board, the
  // same instruction — this is not yours to touch.
  if (!guard.ok) return { ok: false as const, reason: "not_allowed" as const };
  const allowed = await userHasCapability("view_dashboard", guard.tenantId);
  if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, admin };
}

export async function prepAcknowledge(ticketId: string): Promise<PrepActionResult> {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(ticketId).success) return { ok: false, reason: "invalid" };
  const r = await acknowledgeTicket(g.admin, { tenantId: g.tenantId, ticketId });
  return r.ok ? { ok: true, ticketId: r.ticketId } : { ok: false, reason: r.reason };
}

export async function prepReady(ticketId: string): Promise<PrepActionResult> {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(ticketId).success) return { ok: false, reason: "invalid" };
  const r = await markTicketReady(g.admin, { tenantId: g.tenantId, ticketId });
  return r.ok ? { ok: true, ticketId: r.ticketId } : { ok: false, reason: r.reason };
}

export async function prepHandoff(ticketId: string): Promise<PrepActionResult> {
  const g = await staff();
  if (!g.ok) return g;
  if (!uuid.safeParse(ticketId).success) return { ok: false, reason: "invalid" };
  const r = await recordHandoff(g.admin, { tenantId: g.tenantId, ticketId });
  return r.ok ? { ok: true, ticketId: r.ticketId } : { ok: false, reason: r.reason };
}
