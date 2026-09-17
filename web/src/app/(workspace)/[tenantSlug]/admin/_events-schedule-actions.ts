"use server";

/**
 * Events surface, "Programa" tab: the schedule items of one event
 * (`event_schedule_items`) and the event's `program` settings.
 *
 * A sibling of `_events-actions.ts` (at the 800-line cap) with the SAME guard
 * pattern, verbatim: THE TENANT IS NEVER A PARAMETER. `requireWorkspaceStaffAction`
 * resolves it from the session and the workspace under the operator's cursor;
 * every id the caller sends (event, item, night, place, performer) is checked
 * against that tenant inside `lib/events/schedule/staff-store.ts` before
 * anything is written. This file only parses the wire and holds the guard.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { uuidWire } from "@/lib/events/uuid-wire";
import {
  deleteScheduleItemRow,
  duplicateScheduleItemRow,
  importLineupAsScheduleItemRows,
  listEventSpaceRows,
  listScheduleItemRows,
  reorderScheduleItemRows,
  saveEventProgramSettingsRow,
  saveScheduleItemRow,
  searchPerformerRows,
  type DeleteScheduleItemResult,
  type ImportLineupResult,
  type ListEventSpacesResult,
  type ListScheduleItemsResult,
  type ReorderScheduleItemsResult,
  type SaveEventProgramSettingsResult,
  type SaveScheduleItemResult,
  type SearchPerformersResult,
} from "@/lib/events/schedule/staff-store";

// One line on purpose: `scripts/check-server-actions.mjs` classifies an export by its first line.
export type { DeleteScheduleItemResult, ImportLineupResult, ListEventSpacesResult, ListScheduleItemsResult, ReorderScheduleItemsResult, SaveEventProgramSettingsResult, SaveScheduleItemResult, SearchPerformersResult } from "@/lib/events/schedule/staff-store";

const CAPABILITY = "manage_agency_settings" as const;
const CONFIG_ERROR = "Server configuration error.";

const eventIdSchema = z.object({ eventId: uuidWire });
const itemIdSchema = z.object({ id: uuidWire });

/** Every item of the event plus its program settings, for the tab. Read-only: the view capability is enough. */
export async function listScheduleItems(input: { eventId: string }): Promise<ListScheduleItemsResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an event." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CONFIG_ERROR };
  try {
    return await listScheduleItemRows(admin, guard.tenantId, parsed.data.eventId);
  } catch (err) {
    logServerError("events.schedule.list", err);
    return { ok: false, error: "Could not load the program." };
  }
}

/** Create (no `id`) or update (`id`). The store parses the whole shape and checks every foreign key inside the tenant. */
export async function saveScheduleItem(input: unknown): Promise<SaveScheduleItemResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CONFIG_ERROR };
  try {
    const result = await saveScheduleItemRow(admin, guard.tenantId, input);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (err) {
    logServerError("events.schedule.save", err);
    return { ok: false, error: "Could not save the program item." };
  }
}

export async function deleteScheduleItem(input: { id: string }): Promise<DeleteScheduleItemResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = itemIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a program item." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CONFIG_ERROR };
  try {
    const result = await deleteScheduleItemRow(admin, guard.tenantId, parsed.data.id);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (err) {
    logServerError("events.schedule.delete", err);
    return { ok: false, error: "Could not delete the program item." };
  }
}

/** A draft copy titled "<title> (copia)", placed right after the original. */
export async function duplicateScheduleItem(input: { id: string }): Promise<SaveScheduleItemResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = itemIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a program item." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CONFIG_ERROR };
  try {
    const result = await duplicateScheduleItemRow(admin, guard.tenantId, parsed.data.id);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (err) {
    logServerError("events.schedule.duplicate", err);
    return { ok: false, error: "Could not duplicate the program item." };
  }
}

const reorderSchema = z.object({ eventId: uuidWire, orderedIds: z.array(uuidWire).min(1).max(500) });

/** `sort_order = index` for every id; refused whole when any id is not an item of this event. */
export async function reorderScheduleItems(input: { eventId: string; orderedIds: string[] }): Promise<ReorderScheduleItemsResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a valid order." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CONFIG_ERROR };
  try {
    const result = await reorderScheduleItemRows(admin, guard.tenantId, parsed.data.eventId, parsed.data.orderedIds);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (err) {
    logServerError("events.schedule.reorder", err);
    return { ok: false, error: "Could not save the new order." };
  }
}

/** `events.program`: the switch, the heading, set-times-public, group-by. Partial: unnamed keys keep their value. */
export async function saveEventProgramSettings(input: { eventId: string; settings: unknown }): Promise<SaveEventProgramSettingsResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an event." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CONFIG_ERROR };
  try {
    const result = await saveEventProgramSettingsRow(admin, guard.tenantId, parsed.data.eventId, input?.settings);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (err) {
    logServerError("events.schedule.settings", err);
    return { ok: false, error: "Could not save the program settings." };
  }
}

/** "Añadir desde el cartel": one draft `set` item per BOOKED act, time TBA; idempotent by performer. */
export async function importLineupAsScheduleItems(input: { eventId: string }): Promise<ImportLineupResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an event." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CONFIG_ERROR };
  try {
    const result = await importLineupAsScheduleItemRows(admin, guard.tenantId, parsed.data.eventId);
    if (result.ok && result.created > 0) revalidatePath("/", "layout");
    return result;
  } catch (err) {
    logServerError("events.schedule.import", err);
    return { ok: false, error: "Could not import the lineup." };
  }
}

const searchSchema = z.object({ query: z.string().max(80).optional() });

/** The performer picker: roster first, then public talent, each with its hero URL. */
export async function searchPerformers(input: { query?: string }): Promise<SearchPerformersResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = searchSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "That is not a valid search." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CONFIG_ERROR };
  try {
    return await searchPerformerRows(admin, guard.tenantId, parsed.data.query ?? "");
  } catch (err) {
    logServerError("events.schedule.performers", err);
    return { ok: false, error: "Could not search performers." };
  }
}

/** The place picker: active spaces of the event's venue, stage / room / area first. */
export async function listEventSpaces(input: { eventId: string }): Promise<ListEventSpacesResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an event." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CONFIG_ERROR };
  try {
    return await listEventSpaceRows(admin, guard.tenantId, parsed.data.eventId);
  } catch (err) {
    logServerError("events.schedule.spaces", err);
    return { ok: false, error: "Could not load the places." };
  }
}
