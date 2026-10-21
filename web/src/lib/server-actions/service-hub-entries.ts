"use server";

/**
 * The owner's service hub actions (TUL-1369): review queue, groups, per-entry
 * settings, own services. Workspace staff only; the team role is re-checked and
 * every change re-validated against the database in lib/service-hub/entries.server.ts.
 */

import { z } from "zod";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  addOwnService,
  decideQueueItem,
  loadOwnerHub,
  mergeEntries,
  splitEntry,
  updateEntry,
  type HubWriteResult,
  type OwnerHub,
} from "@/lib/service-hub/entries.server";

const uuid = z.string().uuid();

async function ctx() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  return { admin, tenantId: guard.tenantId, userId: guard.user.id };
}

export async function loadOwnerHubAction(): Promise<OwnerHub> {
  const c = await ctx();
  if (!c) return { ok: false };
  return loadOwnerHub(c.admin, c.tenantId);
}

const decisionSchema = z.union([
  z.object({ kind: z.literal("accept_into_group"), entryId: uuid }),
  z.object({ kind: z.literal("new_entry") }),
  z.object({ kind: z.literal("skip") }),
]);

export async function decideQueueItemAction(input: unknown): Promise<HubWriteResult> {
  await requireNotImpersonating();
  const parsed = z.object({ listingId: uuid, decision: decisionSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const c = await ctx();
  if (!c) return { ok: false, reason: "unavailable" };
  return decideQueueItem(c, parsed.data);
}

export async function mergeEntriesAction(input: unknown): Promise<HubWriteResult> {
  await requireNotImpersonating();
  const parsed = z.object({ keepId: uuid, mergeId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const c = await ctx();
  if (!c) return { ok: false, reason: "unavailable" };
  return mergeEntries(c, parsed.data);
}

export async function splitEntryAction(input: unknown): Promise<HubWriteResult> {
  await requireNotImpersonating();
  const parsed = z.object({ entryId: uuid, listingIds: z.array(uuid).min(1).max(100) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const c = await ctx();
  if (!c) return { ok: false, reason: "unavailable" };
  return splitEntry(c, parsed.data);
}

export async function updateEntryAction(input: unknown): Promise<HubWriteResult> {
  await requireNotImpersonating();
  const parsed = z.object({ entryId: uuid, patch: z.record(z.string(), z.unknown()) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const c = await ctx();
  if (!c) return { ok: false, reason: "unavailable" };
  return updateEntry(c, parsed.data);
}

export async function addOwnServiceAction(input: unknown): Promise<HubWriteResult> {
  await requireNotImpersonating();
  const parsed = z.object({ offeringId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const c = await ctx();
  if (!c) return { ok: false, reason: "unavailable" };
  return addOwnService(c, parsed.data);
}
