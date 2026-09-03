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

export type SpacesSnapshot = {
  venueId: string | null;
  venueName: string;
  spaces: SpaceRow[];
  groups: SpaceGroupRow[];
};

export type LoadSpacesResult =
  | { ok: true; snapshot: SpacesSnapshot }
  | { ok: false; error: string };

const MAX_BULK = 60;

async function staffAndVenue(tenantSlug: string) {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false as const, error: "Not allowed." };
  if (staff.tenantSlug !== tenantSlug.trim().toLowerCase()) {
    return { ok: false as const, error: "Not allowed." };
  }
  const venue = await loadDefaultVenue(staff.tenantId);
  if (!venue) return { ok: false as const, error: "This workspace has no venue yet." };
  return { ok: true as const, tenantId: staff.tenantId, venue };
}

export async function loadSpacesSnapshot(tenantSlug: string): Promise<LoadSpacesResult> {
  const ctx = await staffAndVenue(tenantSlug);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const [spaces, groups] = await Promise.all([
    loadSpaces(ctx.tenantId, ctx.venue.id),
    loadSpaceGroups(ctx.tenantId, ctx.venue.id),
  ]);
  return {
    ok: true,
    snapshot: {
      venueId: ctx.venue.id,
      venueName: ctx.venue.name,
      spaces,
      groups,
    },
  };
}

export async function addRoomAction(
  tenantSlug: string,
  name: string,
): Promise<LoadSpacesResult> {
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
