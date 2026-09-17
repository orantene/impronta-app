"use server";

/**
 * The Messages v5 items picker's READERS (L5, boards D05, D09): the catalog
 * behind "Add items to this conversation" and the live slots behind "Times".
 * Same guard and refusal codes as `messaging-engine.ts`. Nothing here writes:
 * the picker's writes are the engine's own (`messagingEnsureSharedDraft`,
 * `messagingSendOptions`, `posAddLine`, `posAddCustomLine`, `rosterAddTalent`).
 */

import { z } from "zod";

import { loadItemsCatalog, loadPersonSlots, type ItemsCatalog, type PersonSlots } from "@/lib/messages-v5/items-catalog";
import { messagingStaff } from "@/lib/messaging/staff-guard";

const uuid = z.string().uuid();
const staff = messagingStaff;

export type ItemsCatalogResult = { ok: true; catalog: ItemsCatalog } | { ok: false; reason: "not_allowed" | "unavailable" | "invalid" };

/** Everything sellable, with availability for the thread's date. */
export async function messagingLoadItemsCatalog(input: { inquiryId: string }): Promise<ItemsCatalogResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return { ok: true, catalog: await loadItemsCatalog(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId }) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export type PersonSlotsResult = PersonSlots | { ok: false; reason: "not_allowed" | "invalid" };

/** D09: one person's free starts from a date (`loadPersonSlots`, the public slots projection behind a staff guard). */
export async function messagingLoadPersonSlots(input: { talentProfileId: string; offeringId?: string | null; from?: string | null; days?: number }): Promise<PersonSlotsResult> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ talentProfileId: uuid, offeringId: uuid.nullable().optional(), from: z.string().max(40).nullable().optional(), days: z.number().int().min(1).max(60).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return loadPersonSlots(g.admin, { tenantId: g.tenantId, ...parsed.data });
}
