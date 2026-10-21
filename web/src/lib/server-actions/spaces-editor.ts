"use server";

/**
 * The venue's rooms, tables and groups — auth and validation only.
 *
 * Every read and write goes through lib/spaces/, never through `.from()` here:
 * the tenant-scoping ratchet rejects a raw table reach from a "use server" file
 * and it is right to, because one module owning the table is what stops a
 * caller finding another route to it.
 */

import { revalidatePath } from "next/cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { loadDefaultVenue } from "@/lib/spaces/venues";
import {
  addRoom,
  addTables,
  loadSpaceGroups,
  loadSpaces,
  type SpaceGroupRow,
  type SpaceRow,
} from "@/lib/spaces/editor";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";

export type SpacesSnapshot = {
  venueId: string | null;
  venueName: string;
  spaces: SpaceRow[];
  groups: SpaceGroupRow[];
  /** TUL-1375: units of each space's own pool (space id -> units), so settings can say "Bookable, N at a time". */
  poolUnits: Record<string, number>;
};

export type LoadSpacesResult =
  | { ok: true; snapshot: SpacesSnapshot }
  | { ok: false; error: string };

const MAX_BULK = 60;

async function staffAndVenue(tenantSlug: string) {
  // TUL-1708 audit: addRoomAction / addTablesAction are genuine viewer-write gaps on the default
  // guard capability (agency.workspace.view) — this is NOT a false positive like the service-hub /
  // rent files. But per the PM decision for TUL-1708 (2026-10-21), operational writers (POS, tables,
  // floor, door, classes, scheduling, venue, customers) are meant to use a new `operate_venue`
  // capability that DEV is adding in its own small PR; `operate_venue` does not exist in
  // web/src/lib/access/capabilities.ts yet. Inventing a substitute capability here would conflict with
  // that incoming work, so this is left on the default on purpose and flagged for a fast follow-up
  // once `operate_venue` lands.
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false as const, error: "Not allowed." };
  if (staff.tenantSlug !== tenantSlug.trim().toLowerCase()) {
    return { ok: false as const, error: "Not allowed." };
  }
  const venue = await loadDefaultVenue(staff.tenantId);
  if (!venue) return { ok: false as const, error: "This workspace has no venue yet." };
  return { ok: true as const, tenantId: staff.tenantId, venue };
}

async function loadSpacePoolUnits(tenantId: string): Promise<Record<string, number>> {
  const admin = createServiceRoleClient();
  if (!admin) return {};
  const { data, error } = await tenantScopedQuery(admin, "capacity_pools", tenantId)
    .select("subject_id, units_total")
    .eq("subject_kind", "space")
    .eq("pool_key", "default");
  if (error) {
    // Display only: without it the settings simply do not show the badge.
    logServerError("spaces-editor.loadSpacePoolUnits", error);
    return {};
  }
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ subject_id: string; units_total: number }>) out[r.subject_id] = r.units_total;
  return out;
}

export async function loadSpacesSnapshot(tenantSlug: string): Promise<LoadSpacesResult> {
  const ctx = await staffAndVenue(tenantSlug);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const [spaces, groups, poolUnits] = await Promise.all([
    loadSpaces(ctx.tenantId, ctx.venue.id),
    loadSpaceGroups(ctx.tenantId, ctx.venue.id),
    loadSpacePoolUnits(ctx.tenantId),
  ]);
  return {
    ok: true,
    snapshot: {
      venueId: ctx.venue.id,
      venueName: ctx.venue.name,
      spaces,
      groups,
      poolUnits,
    },
  };
}

export async function addRoomAction(
  tenantSlug: string,
  name: string,
): Promise<LoadSpacesResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const ctx = await staffAndVenue(tenantSlug);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return { ok: false, error: "Give the room a name." };

  const room = await addRoom(ctx.tenantId, ctx.venue.id, trimmed);
  if (!room) return { ok: false, error: "Could not add the room." };
  revalidatePath(`/${tenantSlug}/admin`);
  return loadSpacesSnapshot(tenantSlug);
}

export async function addTablesAction(
  tenantSlug: string,
  input: {
    roomId: string;
    count: number;
    partyMin: number;
    partyMax: number;
    codePrefix: string;
    groupName: string;
  },
): Promise<LoadSpacesResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const ctx = await staffAndVenue(tenantSlug);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const count = Math.trunc(input.count);
  const partyMin = Math.trunc(input.partyMin);
  const partyMax = Math.trunc(input.partyMax);

  // Bounded here rather than only in the browser: a bulk create is the one
  // action in this editor that can make sixty rows from one click, and the
  // client is display, never a gate.
  if (!Number.isFinite(count) || count < 1 || count > MAX_BULK) {
    return { ok: false, error: `Add between 1 and ${MAX_BULK} at a time.` };
  }
  if (!Number.isFinite(partyMin) || partyMin < 1) {
    return { ok: false, error: "A party is at least one person." };
  }
  if (!Number.isFinite(partyMax) || partyMax < partyMin) {
    return { ok: false, error: "The largest party cannot be smaller than the smallest." };
  }
  const groupName = input.groupName.trim().slice(0, 120);
  if (!groupName) return { ok: false, error: "Name the group these belong to." };

  const result = await addTables(ctx.tenantId, ctx.venue.id, {
    roomId: input.roomId,
    count,
    partyMin,
    partyMax,
    codePrefix: input.codePrefix.trim().slice(0, 8) || "T",
    groupName,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/${tenantSlug}/admin`);
  return loadSpacesSnapshot(tenantSlug);
}
