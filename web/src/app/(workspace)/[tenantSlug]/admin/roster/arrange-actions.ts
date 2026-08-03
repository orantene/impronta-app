"use server";

/**
 * Roster "Arrange directory order" action.
 *
 * Persists the agency-curated Recommended order to
 * `talent_profiles.manual_rank_override` — the column the public directory's
 * default sort (fetch-directory-page.ts applySort) and the AI-search rerank
 * (lib/ai/rerank.ts §5) both read. Lower rank = earlier in the directory;
 * null = never manually ranked (falls through to featured/recency order).
 *
 * Capability: agency.roster.edit (same as individual + bulk edit).
 * Security boundary: only IDs confirmed to be on this tenant's roster are
 * updated.
 *
 * NOTE: `manual_rank_override` lives on the talent profile, not the roster
 * row, so the rank is global to the talent (same as is_featured /
 * featured_position). In practice a talent has one primary agency directory,
 * and cross-surface consistency (directory + AI search) is what we want.
 */

import { revalidatePath } from "next/cache";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

export type SaveDirectoryOrderResult =
  | { ok: true; updatedCount: number }
  | { ok: false; error: string };

const MAX_ORDER_SIZE = 500;

/**
 * Persist the full curated order. `orderedTalentIds` is the roster in the
 * exact order the admin arranged it — index 0 becomes rank 1. Every talent
 * in the list gets an explicit rank so the public order exactly matches
 * what the admin saw when arranging.
 */
export async function saveDirectoryOrder(
  tenantSlug: string,
  orderedTalentIds: string[],
): Promise<SaveDirectoryOrderResult> {
  if (orderedTalentIds.length === 0) return { ok: true, updatedCount: 0 };
  if (orderedTalentIds.length > MAX_ORDER_SIZE) {
    return { ok: false, error: "Too many talents in one reorder." };
  }
  const uniqueIds = new Set(orderedTalentIds);
  if (uniqueIds.size !== orderedTalentIds.length) {
    return { ok: false, error: "Duplicate talent in reorder payload." };
  }

  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) return { ok: false, error: "You don't have permission to edit talent." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Resolve which IDs are actually on this tenant's roster (security boundary).
  const { data: rosterRows, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", scope.tenantId)
    .in("talent_profile_id", orderedTalentIds)
    .neq("status", "removed");

  if (rosterErr) {
    logServerError("roster.saveDirectoryOrder/rosterCheck", rosterErr);
    return { ok: false, error: "Could not verify roster membership." };
  }

  const confirmed = new Set(
    ((rosterRows ?? []) as { talent_profile_id: string }[]).map(
      (r) => r.talent_profile_id,
    ),
  );

  // Rank = 1-based position among the confirmed subset, preserving the
  // arranged order even if some submitted IDs were filtered out.
  const updates: { id: string; rank: number }[] = [];
  let rank = 1;
  for (const id of orderedTalentIds) {
    if (!confirmed.has(id)) continue;
    updates.push({ id, rank });
    rank += 1;
  }
  if (updates.length === 0) return { ok: true, updatedCount: 0 };

  const now = new Date().toISOString();
  const results = await Promise.all(
    updates.map(({ id, rank: r }) =>
      admin
        .from("talent_profiles")
        .update({ manual_rank_override: r, updated_at: now })
        .eq("id", id),
    ),
  );
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    logServerError("roster.saveDirectoryOrder/update", failed[0].error);
    return { ok: false, error: "Could not save the new order. Try again." };
  }

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidateDirectoryListing();
  return { ok: true, updatedCount: updates.length };
}

/**
 * Clear the curated order for this tenant's roster — every talent goes back
 * to the automatic Recommended ordering (featured → recency).
 */
export async function clearDirectoryOrder(
  tenantSlug: string,
): Promise<SaveDirectoryOrderResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) return { ok: false, error: "You don't have permission to edit talent." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: rosterRows, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", scope.tenantId)
    .neq("status", "removed");

  if (rosterErr) {
    logServerError("roster.clearDirectoryOrder/rosterCheck", rosterErr);
    return { ok: false, error: "Could not load the roster." };
  }

  const ids = ((rosterRows ?? []) as { talent_profile_id: string }[]).map(
    (r) => r.talent_profile_id,
  );
  if (ids.length === 0) return { ok: true, updatedCount: 0 };

  const { error: updateErr } = await admin
    .from("talent_profiles")
    .update({ manual_rank_override: null, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (updateErr) {
    logServerError("roster.clearDirectoryOrder/update", updateErr);
    return { ok: false, error: "Could not reset the order. Try again." };
  }

  revalidatePath(`/${tenantSlug}/admin/roster`);
  revalidateDirectoryListing();
  return { ok: true, updatedCount: ids.length };
}
