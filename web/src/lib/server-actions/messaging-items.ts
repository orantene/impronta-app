"use server";

/**
 * The Messages v5 items picker's READERS (L5, boards D05, D09): the catalog
 * behind "Add items to this conversation" and the live slots behind "Times".
 * Same refusal codes as `messaging-engine.ts`. Nothing here writes: the
 * picker's writes are the engine's own (`messagingEnsureSharedDraft`,
 * `messagingSendOptions`, `posAddLine`, `posAddCustomLine`, `rosterAddTalent`).
 *
 * Auth: inquiry managers (workspace staff OR an active coordinator on THIS
 * inquiry). Talent inbox lives at `/talent/inbox`, which is not an admin
 * surface — `messagingStaff()` / `requireWorkspaceStaffAction` alone rejects
 * the solo talent who owns the guest thread (they are coordinator, not
 * "workspace staff" under the admin-scope path). Live 2026-09-25: Jorgelina
 * on Ana's guest inquiry hit "The catalog did not load" because the staff
 * gate failed closed while `inquiry_participants` already had her as
 * `role=coordinator, status=active`.
 */

import { z } from "zod";

import { loadItemsCatalog, loadPersonSlots, type ItemsCatalog, type PersonSlots } from "@/lib/messages-v5/items-catalog";
import { requireInquiryManagerAction } from "@/lib/saas/admin-scope";
import { messagingStaff } from "@/lib/messaging/staff-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

const uuid = z.string().uuid();

export type ItemsCatalogResult = { ok: true; catalog: ItemsCatalog } | { ok: false; reason: "not_allowed" | "unavailable" | "invalid" };

/** Everything sellable, with availability for the thread's date. */
export async function messagingLoadItemsCatalog(input: { inquiryId: string }): Promise<ItemsCatalogResult> {
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const inquiryId = parsed.data.inquiryId;
  const mgr = await requireInquiryManagerAction(inquiryId);
  let tenantId: string | null = null;
  if (mgr.ok) {
    tenantId = mgr.tenantId;
  } else {
    // Admin Messages without a coordinator row yet — workspace staff fallback.
    const g = await messagingStaff();
    if (!g.ok) return g;
    tenantId = g.tenantId;
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  try {
    return { ok: true, catalog: await loadItemsCatalog(admin, { tenantId, inquiryId }) };
  } catch (err) {
    logServerError("messagesV5.itemsCatalog/load", err);
    return { ok: false, reason: "unavailable" };
  }
}

export type PersonSlotsResult = PersonSlots | { ok: false; reason: "not_allowed" | "invalid" };

/**
 * D09: one person's free starts from a date (`loadPersonSlots`).
 * Staff-gated today; Times sheet is opened from an already-authorized
 * inquiry manager session. Tenant comes from workspace staff scope.
 */
export async function messagingLoadPersonSlots(input: { talentProfileId: string; offeringId?: string | null; from?: string | null; days?: number }): Promise<PersonSlotsResult> {
  const g = await messagingStaff();
  if (!g.ok) return g;
  const parsed = z
    .object({ talentProfileId: uuid, offeringId: uuid.nullable().optional(), from: z.string().max(40).nullable().optional(), days: z.number().int().min(1).max(60).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return loadPersonSlots(g.admin, { tenantId: g.tenantId, ...parsed.data });
}
