/**
 * structure-model.server.ts — load the objects a user owns.
 *
 * The DB half of `structure-model.ts`. Kept separate for the same reason
 * `workspace-signup.server.ts` is: the derivation must stay importable from a
 * test and from a client component without dragging the service-role client in.
 *
 * Everything here is a read. Nothing in this file decides anything.
 */

import "server-only";
import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  EMPTY_OWNED_OBJECTS,
  isHome,
  type Home,
  type OwnedObjects,
  type RosterRef,
  type WorkspaceRef,
} from "./structure-model";

type MembershipRow = {
  tenant_id: string;
  role: string | null;
  agencies: {
    id: string;
    slug: string | null;
    display_name: string | null;
    plan_tier: string | null;
    workspace_type: string | null;
    status: string | null;
  } | null;
};

/**
 * Load the observable objects for a user.
 *
 * Cached per request: the home chooser, the shell, and the intake all want this
 * and none of them should each pay for it.
 *
 * On any read failure this returns the empty set rather than throwing. That is
 * the right direction here — an empty set derives to `unformed`, which shows a
 * chooser or the intake, whereas a throw takes down whatever shell called it.
 * Callers that need to distinguish "owns nothing" from "could not tell" should
 * read the logged error; no surface currently does.
 */
export const loadOwnedObjects = cache(async (userId: string): Promise<OwnedObjects> => {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY_OWNED_OBJECTS;

  try {
    const [talentRes, memberRes] = await Promise.all([
      // profile_kind = 'person' is the whole point: `resource` rows are staff
      // and chairs on a business workspace, with user_id NULL and a DB trigger
      // refusing to ever attach a login. A salon owner is not six people.
      sb
        .from("talent_profiles")
        .select("id")
        .eq("user_id", userId)
        .eq("profile_kind", "person")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
      sb
        .from("agency_memberships")
        .select(
          "tenant_id, role, agencies:tenant_id ( id, slug, display_name, plan_tier, workspace_type, status )",
        )
        .eq("profile_id", userId)
        .eq("status", "active"),
    ]);

    const talentProfileId = (talentRes.data as { id: string } | null)?.id ?? null;

    const owned: WorkspaceRef[] = [];
    const staff: WorkspaceRef[] = [];
    for (const row of (memberRes.data ?? []) as unknown as MembershipRow[]) {
      const a = row.agencies;
      if (!a) continue;
      const ref: WorkspaceRef = {
        tenantId: row.tenant_id,
        slug: a.slug,
        displayName: a.display_name,
        planTier: a.plan_tier,
        workspaceType: a.workspace_type,
        status: a.status,
      };
      if (row.role === "owner") owned.push(ref);
      else staff.push(ref);
    }

    // Representation only means something when someone ELSE holds the roster
    // row. Solo workspaces put their owner on their own roster
    // (`ensureSelfRoster`), and counting that as representation would make every
    // solo talent look agency-represented.
    let representedBy: RosterRef[] = [];
    if (talentProfileId) {
      const ownTenantIds = new Set(owned.map((w) => w.tenantId));
      const { data: roster } = await sb
        .from("agency_talent_roster")
        .select("tenant_id, is_primary, status")
        .eq("talent_profile_id", talentProfileId)
        .in("status", ["active", "pending"]);
      representedBy = ((roster ?? []) as Array<{
        tenant_id: string;
        is_primary: boolean | null;
        status: string | null;
      }>)
        .filter((r) => !ownTenantIds.has(r.tenant_id))
        .map((r) => ({
          tenantId: r.tenant_id,
          isPrimary: Boolean(r.is_primary),
          status: r.status ?? "active",
        }));
    }

    return { talentProfileId, ownedWorkspaces: owned, staffWorkspaces: staff, representedBy };
  } catch (err) {
    logServerError("tulala.loadOwnedObjects", err);
    return EMPTY_OWNED_OBJECTS;
  }
});

/** The user's stored home choice, or null when they have never made one. */
export async function loadHomePreference(userId: string): Promise<Home | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("profiles")
      .select("home_surface_preference")
      .eq("id", userId)
      .maybeSingle();
    const raw = (data as { home_surface_preference?: string | null } | null)
      ?.home_surface_preference;
    return isHome(raw) ? raw : null;
  } catch (err) {
    logServerError("tulala.loadHomePreference", err);
    return null;
  }
}

/**
 * Persist a home choice.
 *
 * Validated against `isHome` rather than trusted, and `null` is an accepted
 * value meaning "ask me again". Writes nothing else — in particular it never
 * touches `app_role`, which is the entire point of the column.
 */
export async function saveHomePreference(
  userId: string,
  home: Home | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (home !== null && !isHome(home)) return { ok: false, error: "Unknown home surface." };
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };
  try {
    const { error } = await sb
      .from("profiles")
      .update({ home_surface_preference: home })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    logServerError("tulala.saveHomePreference", err);
    return { ok: false, error: "Could not save your choice." };
  }
}
