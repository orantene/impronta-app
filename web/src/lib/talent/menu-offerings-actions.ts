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
import { setOfferingStock } from "@/lib/capacity";
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

type StockResult =
  | { ok: true; available: number | null; held: number; unitsTotal: number | null }
  | { ok: false; error: string };

/**
 * Set a menu item's AVAILABLE stock. Empty / null means unlimited.
 *
 * A stock edit is NOT a number write, which is why this goes through
 * `setOfferingStock` and why `inventory_qty` is absent from
 * `offeringToRowPatch`'s return type. Typing "20" means twenty AVAILABLE, so the
 * RPC computes `units_total = 20 + held` under the pool's row lock. Writing 20
 * into the total would shrink the ceiling below what live orders already hold;
 * writing `inventory_qty` alone would desync the mirror the public board reads.
 *
 * Reducing below what is held is allowed and never cancels a hold: availability
 * goes to 0 and the buyers keep their seats. Taking a seat back from someone who
 * paid is a refund decision, not a side effect of an editor field.
 *
 * The tenant + owner_kind check is not redundant with the RPC: `setOfferingStock`
 * runs service-role and takes an offering id, so without this an authenticated
 * staff member of ANY workspace could set stock on ANY offering, including a
 * talent-owned one that merely carries their tenant id.
 */
export async function setMenuItemStockAction(
  tenantId: string,
  offeringId: string,
  available: number | null,
): Promise<StockResult> {
  try {
    const auth = await authorizeForWorkspace(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Database not available." };

    const { data: row, error: selErr } = await offeringsTable(admin)
      .select("id")
      .eq("id", offeringId)
      .eq("tenant_id", tenantId)
      .eq("owner_kind", "workspace")
      .maybeSingle();
    if (selErr || !row) return { ok: false, error: "Menu item not found." };

    const result = await setOfferingStock(offeringId, available, admin);
    if (!result.ok) {
      const message =
        result.reason === "negative_stock"
          ? "Stock cannot be negative."
          : result.reason === "offering_not_found"
            ? "Menu item not found."
            : "Could not update stock.";
      return { ok: false, error: message };
    }

    revalidatePath("/", "layout");
    return {
      ok: true,
      available: result.available,
      held: result.held,
      unitsTotal: result.unitsTotal,
    };
  } catch (error) {
    logServerError("menuOfferings.setStock", error);
    return { ok: false, error: "Could not update stock." };
  }
}
