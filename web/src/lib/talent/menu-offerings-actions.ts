"use server";

/**
 * Workspace Menu catalogue actions — same table as talent offerings, filtered
 * by owner_kind='workspace' AND tenant_id. Staff must pass both predicates or
 * they can edit a talent-owned row that happens to carry their tenant id.
 */

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { resolveDefaultCurrencyForUI } from "@/lib/billing/currencies";
import {
  blankOffering,
  offeringToRowPatch,
  rowToOffering,
  validateOffering,
  type TalentOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";

type AuthOk = { ok: true; userId: string; tenantId: string; defaultCurrency: string };
type AuthFail = { ok: false; error: string };

async function authorizeForWorkspace(tenantId: string): Promise<AuthOk | AuthFail> {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false, error: staff.error };
  if (staff.tenantId !== tenantId) {
    return { ok: false, error: "Not authorized for this workspace." };
  }
  return {
    ok: true,
    userId: staff.user.id,
    tenantId: staff.tenantId,
    defaultCurrency: resolveDefaultCurrencyForUI(null),
  };
}

function offeringsTable(admin: NonNullable<ReturnType<typeof createServiceRoleClient>>) {
  return admin.from("talent_offerings");
}

type LoadResult =
  | { ok: true; items: TalentOffering[]; defaultCurrency: string }
  | { ok: false; error: string };

export async function loadWorkspaceMenuForEditor(tenantId: string): Promise<LoadResult> {
  try {
    const auth = await authorizeForWorkspace(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const { data, error } = await offeringsTable(admin)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("owner_kind", "workspace")
      .neq("status", "archived")
      .order("sort_order", { ascending: true });
    if (error) {
      logServerError("menu.offerings.load", error);
      return { ok: false, error: "Could not load the menu." };
    }
    const rows = (data ?? []) as TalentOfferingRow[];
    const items = rows.map((r) => rowToOffering(r, "en", []));
    return { ok: true, items, defaultCurrency: auth.defaultCurrency };
  } catch (err) {
    logServerError("menu.offerings.load", err);
    return { ok: false, error: "Unexpected error." };
  }
}

type SaveResult = { ok: true; item: TalentOffering } | { ok: false; error: string };

export async function upsertWorkspaceMenuItem(
  tenantId: string,
  offering: TalentOffering,
): Promise<SaveResult> {
  try {
    const auth = await authorizeForWorkspace(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const errors = validateOffering(offering);
    if (errors.length > 0) return { ok: false, error: errors[0] };

    const patch = {
      ...offeringToRowPatch({
        ...offering,
        ownerKind: "workspace",
        talentProfileId: null,
        tenantId,
      }),
      talent_profile_id: null,
      owner_kind: "workspace",
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    };

    let saved: TalentOfferingRow | null = null;
    if (offering.id) {
      const { data, error } = await offeringsTable(admin)
        .update(patch)
        .eq("id", offering.id)
        .eq("tenant_id", tenantId)
        .eq("owner_kind", "workspace")
        .select("*")
        .maybeSingle();
      if (error) {
        logServerError("menu.offerings.update", error);
        return { ok: false, error: "Failed to save." };
      }
      saved = data as TalentOfferingRow | null;
    } else {
      const { data, error } = await offeringsTable(admin).insert(patch).select("*").maybeSingle();
      if (error) {
        logServerError("menu.offerings.insert", error);
        return { ok: false, error: "Failed to save." };
      }
      saved = data as TalentOfferingRow | null;
    }
    if (!saved) return { ok: false, error: "Failed to save." };
    revalidatePath("/");
    return { ok: true, item: rowToOffering(saved, "en", offering.imageUrls ?? []) };
  } catch (err) {
    logServerError("menu.offerings.upsert", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function deleteWorkspaceMenuItem(
  tenantId: string,
  offeringId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizeForWorkspace(tenantId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const { error } = await offeringsTable(admin)
    .delete()
    .eq("id", offeringId)
    .eq("tenant_id", tenantId)
    .eq("owner_kind", "workspace");
  if (error) {
    logServerError("menu.offerings.delete", error);
    return { ok: false, error: "Failed to delete." };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function reorderWorkspaceMenuItems(
  tenantId: string,
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizeForWorkspace(tenantId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await offeringsTable(admin)
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq("id", orderedIds[i]!)
      .eq("tenant_id", tenantId)
      .eq("owner_kind", "workspace");
    if (error) {
      logServerError("menu.offerings.reorder", error);
      return { ok: false, error: "Failed to reorder." };
    }
  }
  revalidatePath("/");
  return { ok: true };
}

/** Helper for tests / blank drafts. */
export async function blankWorkspaceMenuItem(
  tenantId: string,
  sortOrder: number,
): Promise<TalentOffering | null> {
  const auth = await authorizeForWorkspace(tenantId);
  if (!auth.ok) return null;
  return blankOffering({ kind: "workspace", tenantId }, auth.defaultCurrency, sortOrder);
}
