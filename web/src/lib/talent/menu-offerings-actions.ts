"use server";

/**
 * Workspace Menu catalogue actions — same table as talent offerings, filtered
 * by owner_kind='workspace' AND tenant_id. Staff must pass both predicates or
 * they can edit a talent-owned row that happens to carry their tenant id.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { resolveDefaultCurrencyForUI } from "@/lib/billing/currencies";
import { defaultCreateTypeForFamily, defaultCurrencyForCountry, type CatalogCreateTypeId } from "@/lib/catalog/service-defaults";
import { resolveTenantBusinessType } from "@/lib/site-admin/builder-core/site-templates/tenant-business-type";
import { setOfferingStock } from "@/lib/capacity";
import { loadNonMenuOfferingIds, withoutNonMenuOfferings } from "@/lib/offerings/non-menu-offerings";
import { fetchOwnerTalentIds, workspaceOfferingOrFilter } from "@/lib/offerings/workspace-offering-scope";
import { OFFERING_MEDIA_EMBED, imagesFromEmbed, loadOfferingImageAssets } from "@/lib/talent/offering-images.server";
import { MAX_ITEM_PHOTOS, nextPhotoIds } from "@/lib/talent/workspace-item-photos";
import { loadWorkspaceMenuDefaults } from "@/lib/talent/workspace-menu-defaults";
import {
  loadOfferingChildren,
  replaceOfferingChildren,
  type OfferingChildrenInput,
  type OfferingChildrenSaved,
} from "@/lib/talent/offerings-children";
import {
  blankOffering,
  offeringToRowPatch,
  rowToOffering,
  validateOffering,
  type TalentOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";
import { assertNotImpersonating, requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { normalizeWorkspaceLocale } from "@/lib/talent/workspace-primary-locale";
import { commitServiceSlugHistory, prepareServiceSlugRename } from "@/lib/talent-site/service-slug-rename.server";
import { bustTalentSiteCache } from "@/lib/talent-site/cache-tags";
import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { workspaceOfferingSaveGate } from "@/lib/talent/offering-save-gate.server";
import { runMenuWriteSideEffects, type MenuSideEffectDeps, type MenuWriteKind } from "@/lib/talent/workspace-menu-side-effects";

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

/** TUL-1634: the real side effects (the same helpers the talent service writes call). */
const MENU_SIDE_EFFECTS: MenuSideEffectDeps = {
  revalidatePath: (path) => revalidatePath(path),
  bustTalentSiteCache,
  scheduleRebuildAiSearchDocument,
  logServerError,
};

/** The workspace OWNER's talent profile (plan, default posture, talent site, AI document); null when none. */
async function ownerTalentIdOf(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
): Promise<string | null> {
  const ids = await fetchOwnerTalentIds(admin, tenantId);
  return ids.values().next().value ?? null;
}

/** TUL-1634: cache bust + AI search rebuild after a stored write. Logs and continues; never loses the write. */
async function afterMenuWrite(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  kind: MenuWriteKind,
  ownerTalentId?: string | null,
): Promise<void> {
  try {
    const owner = ownerTalentId === undefined ? await ownerTalentIdOf(admin, tenantId) : ownerTalentId;
    await runMenuWriteSideEffects(admin, { kind, ownerTalentId: owner }, MENU_SIDE_EFFECTS);
  } catch (err) {
    logServerError(`menu.offerings.sideEffects.${kind}`, err);
  }
}

/** The workspace's primary language (business identity default_locale); "en" when unset or unreadable. */
async function workspacePrimaryLocale(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("agency_business_identity")
    .select("default_locale")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ default_locale: string | null }>();
  if (error) logServerError("menu.offerings.primaryLocale", error);
  return normalizeWorkspaceLocale(error ? null : data?.default_locale);
}

/** True when this offering is the catalog row behind a ticketed event. */
async function isEventOfferingId(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  offeringId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("offering_id", offeringId)
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("menu.offerings.isEventOffering", error);
    // Fail closed: refuse the Menu write rather than mutate an event's row.
    return true;
  }
  return Boolean(data?.id);
}

type LoadResult =
  | { ok: true; items: TalentOffering[]; defaultCurrency: string; defaultCreateType: CatalogCreateTypeId }
  | { ok: false; error: string };

export async function loadWorkspaceMenuForEditor(tenantId: string): Promise<LoadResult> {
  try {
    const auth = await authorizeForWorkspace(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    // B5: the language and the create defaults do not depend on the rows; start them now.
    const defaultsPending = loadWorkspaceMenuDefaults(admin, tenantId);

    // Event offerings live on the same table (`owner_kind=workspace`) but
    // belong to Events, not Menu. Exclude any id that an `events.offering_id`
    // points at so a ticketed night never shows up as a sellable menu package.
    const ownerTalentIds = await fetchOwnerTalentIds(admin, tenantId);
    const [{ data, error }, nonMenu] = await Promise.all([
      offeringsTable(admin)
        // The photos ride in the same read (embedded join): no extra round trip on the load path.
        .select(`*, ${OFFERING_MEDIA_EMBED}`)
        .eq("tenant_id", tenantId)
        // TUL-915: the house rows PLUS the workspace OWNER's own provider rows
        // (onboarding writes those as owner_kind='talent' and the public site
        // shows them). Reading only 'workspace' left the Catalog empty while a
        // service was bookable. Tenant stays pinned above; writes below are
        // unchanged and still workspace-only.
        .or(workspaceOfferingOrFilter(ownerTalentIds))
        .neq("status", "archived")
        // Ties on sort_order (every seeded row is 0) would otherwise come back
        // in whatever order the last update left them.
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      loadNonMenuOfferingIds(admin, tenantId),
    ]);
    if (error) {
      logServerError("menu.offerings.load", error);
      return { ok: false, error: "Could not load the menu." };
    }
    if (nonMenu.error) {
      // Fail closed in the editor: better to refuse the load than list a
      // ticketed event as a menu dish (public board fails open on purpose).
      logServerError("menu.offerings.eventIds", nonMenu.error);
      return { ok: false, error: "Could not load the menu." };
    }
    const rows = withoutNonMenuOfferings((data ?? []) as TalentOfferingRow[], nonMenu.ids);
    // The Catalog's Options tab edits the same child rows the talent editor
    // does (variants = pick one, add-ons = stack any), so the load carries them.
    // B5: one stage, not three: the children beside the defaults started above.
    const [children, defaults] = await Promise.all([loadOfferingChildren(admin, rows.map((r) => r.id)), defaultsPending]);
    const primaryLocale = defaults.primaryLocale;
    const items = rows.map((r) => {
      // The editor edits the PRIMARY-language text; the maps ride along.
      const assets = imagesFromEmbed(admin as unknown as SupabaseClient, r as unknown as { talent_offering_media?: unknown });
      const item = rowToOffering(r, primaryLocale, assets.map((a) => a.url), [primaryLocale]);
      item.imageAssets = assets;
      item.variants = children.variants.get(r.id) ?? [];
      item.addOns = children.addOns.get(r.id) ?? [];
      return item;
    });
    // TUL-77 (#36): defaults from business family + country, not one
    // restaurant-shaped answer for every workspace. A failed read already fell
    // back to the neutral defaults (Service, platform currency).
    const family = resolveTenantBusinessType(defaults.agencySettings).family;
    return {
      ok: true,
      items,
      defaultCurrency: defaultCurrencyForCountry(defaults.addressCountry, auth.defaultCurrency),
      defaultCreateType: defaultCreateTypeForFamily(family),
    };
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
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const auth = await authorizeForWorkspace(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const errors = validateOffering(offering);
    if (errors.length > 0) return { ok: false, error: errors[0] };
    // TUL-1634: the same publish-readiness + plan gate and MXN/USD rule as upsertTalentOffering.
    const ownerTalentId = await ownerTalentIdOf(admin, tenantId);
    const gate = await workspaceOfferingSaveGate(admin, tenantId, ownerTalentId, offering);
    if (!gate.ok) return gate;

    if (offering.id && (await isEventOfferingId(admin, tenantId, offering.id))) {
      return { ok: false, error: "This item belongs to an event. Edit it under Events." };
    }

    // The kitchen station must be this workspace's own (the column is a bare uuid).
    if (offering.prepStationId) {
      const { data: station, error: stationErr } = await admin
        .from("prep_stations")
        .select("id")
        .eq("id", offering.prepStationId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (stationErr) {
        logServerError("menu.offerings.station", stationErr);
        return { ok: false, error: "Failed to save." };
      }
      if (!station) return { ok: false, error: "That kitchen station is not in this workspace." };
    }

    const primaryLocale = await workspacePrimaryLocale(admin, tenantId);
    const patch = {
      ...offeringToRowPatch({
        ...offering,
        ownerKind: "workspace",
        talentProfileId: null,
        tenantId,
      }, primaryLocale), // the workspace's own language: a Spanish title is stored as `es`, not `en`
      talent_profile_id: null,
      owner_kind: "workspace",
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    };

    let saved: TalentOfferingRow | null = null;
    if (offering.id) {
      // TUL-1594: a rename keeps the old link alive in offering_slugs (scope w:<tenant>); flag + table gated.
      const slugRename = await prepareServiceSlugRename(admin, { offeringId: offering.id, tenantId, nextTitle: offering.title });
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
      if (slugRename && saved) await commitServiceSlugHistory(admin, slugRename);
    } else {
      const { data, error } = await offeringsTable(admin).insert(patch).select("*").maybeSingle();
      if (error) {
        logServerError("menu.offerings.insert", error);
        return { ok: false, error: "Failed to save." };
      }
      saved = data as TalentOfferingRow | null;
    }
    if (!saved) return { ok: false, error: "Failed to save." };
    await afterMenuWrite(admin, tenantId, "save", ownerTalentId);
    return { ok: true, item: rowToOffering(saved, primaryLocale, offering.imageUrls ?? [], [primaryLocale]) };
  } catch (err) {
    logServerError("menu.offerings.upsert", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * True when this item was ever published or sold. Such an item is ARCHIVED, never
 * deleted: a hard delete nulls `order_lines.offering_id`, so past orders lose
 * what they were for. Fails CLOSED: a failed history read counts as history.
 */
async function offeringHasHistory(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  offeringId: string,
  row: { status: string | null; first_published_at: string | null },
): Promise<boolean> {
  if (row.status === "published" || row.first_published_at) return true;
  const [lines, bookings] = await Promise.all([
    admin.from("order_lines").select("id", { count: "exact", head: true }).eq("offering_id", offeringId),
    admin.from("talent_bookings").select("id", { count: "exact", head: true }).eq("offering_id", offeringId),
  ]);
  if (lines.error || bookings.error) {
    logServerError("menu.offerings.history", lines.error ?? bookings.error);
    return true;
  }
  return (lines.count ?? 0) > 0 || (bookings.count ?? 0) > 0;
}

export type DeleteMenuItemResult = { ok: boolean; error?: string; code?: "has_history" | "not_found" };

export async function deleteWorkspaceMenuItem(
  tenantId: string,
  offeringId: string,
): Promise<DeleteMenuItemResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const auth = await authorizeForWorkspace(tenantId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  if (await isEventOfferingId(admin, tenantId, offeringId)) {
    return { ok: false, error: "This item belongs to an event. Remove it under Events." };
  }
  const { data: row, error: rowErr } = await offeringsTable(admin)
    .select("id, status, first_published_at")
    .eq("id", offeringId)
    .eq("tenant_id", tenantId)
    .eq("owner_kind", "workspace")
    .maybeSingle<{ id: string; status: string | null; first_published_at: string | null }>();
  if (rowErr) {
    logServerError("menu.offerings.deleteRead", rowErr);
    return { ok: false, error: "Failed to delete." };
  }
  // A provider-owned row (the owner's own service, listed here) matches nothing
  // in a workspace delete. Say so instead of reporting a delete that did not
  // happen and letting the row vanish until the next reload.
  if (!row) {
    return { ok: false, code: "not_found", error: "This item is not part of the workspace menu. Remove it under Services." };
  }
  if (await offeringHasHistory(admin, offeringId, row)) {
    return { ok: false, code: "has_history", error: "This item was published or sold, so it cannot be deleted. Archive it instead." };
  }
  const { data: gone, error } = await offeringsTable(admin)
    .delete()
    .eq("id", offeringId)
    .eq("tenant_id", tenantId)
    .eq("owner_kind", "workspace")
    .select("id");
  if (error) {
    logServerError("menu.offerings.delete", error);
    return { ok: false, error: "Failed to delete." };
  }
  if (!gone || gone.length === 0) {
    return { ok: false, code: "not_found", error: "This item was already removed. Reload the list." };
  }
  await afterMenuWrite(admin, tenantId, "delete");
  return { ok: true };
}

/** Archive (off sale everywhere, history kept) or restore (back as a draft) a workspace item. */
export async function setWorkspaceMenuItemArchived(
  tenantId: string,
  offeringId: string,
  archived: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const auth = await authorizeForWorkspace(tenantId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  if (await isEventOfferingId(admin, tenantId, offeringId)) {
    return { ok: false, error: "This item belongs to an event. Edit it under Events." };
  }
  const { data, error } = await offeringsTable(admin)
    .update({ status: archived ? "archived" : "draft", updated_at: new Date().toISOString() })
    .eq("id", offeringId)
    .eq("tenant_id", tenantId)
    .eq("owner_kind", "workspace")
    .select("id");
  if (error) {
    logServerError("menu.offerings.archive", error);
    return { ok: false, error: archived ? "Failed to archive." : "Failed to restore." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "This item is not part of the workspace menu. Change it under Services." };
  }
  await afterMenuWrite(admin, tenantId, "archive");
  return { ok: true };
}

/** The workspace's archived items, for the Archived view (the main load hides them). */
export async function loadWorkspaceArchivedMenu(
  tenantId: string,
): Promise<{ ok: true; items: TalentOffering[] } | { ok: false; error: string }> {
  try {
    const auth = await authorizeForWorkspace(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    const { data, error } = await offeringsTable(admin)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("owner_kind", "workspace")
      .eq("status", "archived")
      .order("updated_at", { ascending: false });
    if (error) {
      logServerError("menu.offerings.archivedLoad", error);
      return { ok: false, error: "Could not load archived items." };
    }
    const primaryLocale = await workspacePrimaryLocale(admin, tenantId);
    return {
      ok: true,
      items: ((data ?? []) as TalentOfferingRow[]).map((r) => rowToOffering(r, primaryLocale, [], [primaryLocale])),
    };
  } catch (err) {
    logServerError("menu.offerings.archivedLoad", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function reorderWorkspaceMenuItems(
  tenantId: string,
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
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
  await afterMenuWrite(admin, tenantId, "reorder");
  return { ok: true };
}

/**
 * Replace a workspace item's OPTIONS (variants) and EXTRAS (add-ons): the
 * same writer the talent editor uses (`replaceOfferingChildren`), behind the
 * workspace's own guard. The tenant + owner_kind check is the only thing
 * keeping staff off a talent-owned row that carries their tenant id.
 */
export async function setWorkspaceMenuItemOptions(
  tenantId: string,
  offeringId: string,
  input: OfferingChildrenInput,
): Promise<OfferingChildrenSaved> {
  await requireNotImpersonating();
  try {
    const auth = await authorizeForWorkspace(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    const { data: own, error: ownErr } = await offeringsTable(admin)
      .select("id")
      .eq("id", offeringId)
      .eq("tenant_id", tenantId)
      .eq("owner_kind", "workspace")
      .maybeSingle();
    if (ownErr || !own) return { ok: false, error: "Menu item not found." };
    if (await isEventOfferingId(admin, tenantId, offeringId)) {
      return { ok: false, error: "This item belongs to an event. Edit it under Events." };
    }
    const saved = await replaceOfferingChildren(admin, offeringId, input, "menu.offerings", await workspacePrimaryLocale(admin, tenantId));
    if (!saved.ok) return saved;
    await afterMenuWrite(admin, tenantId, "options");
    return saved;
  } catch (err) {
    logServerError("menu.offerings.setOptions", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Helper for tests / blank drafts. */
export async function blankWorkspaceMenuItem(
  tenantId: string,
  sortOrder: number,
): Promise<TalentOffering | null> {
  await requireNotImpersonating();
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
 * THE TENANT + owner_kind CHECK BELOW IS THE ONLY GUARD. Do not remove it.
 *
 * Measured on production: `set_offering_stock` is SECURITY DEFINER and neither
 * `authenticated` nor `anon` may execute it, so no client reaches the RPC
 * directly. That does not make this check redundant — it makes it load-bearing.
 * THIS ACTION is what a client reaches: it is a `"use server"` export, callable
 * by any authenticated staff member, and it hands the RPC an offering id under
 * service role. Without the check below, this function is itself the
 * cross-tenant write, with nothing behind it.
 *
 * When the Capacity Engine adds `p_tenant_id` (their 0.10), this becomes belt
 * and braces rather than the only brace — but the two assert DIFFERENT things
 * and both are still needed. Theirs: the offering belongs to that tenant.
 * Ours: the CALLER is staff of that tenant, and the row is owner_kind
 * 'workspace'. A talent-owned offering carrying this tenant's id passes theirs
 * and must still fail ours.
 */
export async function setMenuItemStockAction(
  tenantId: string,
  offeringId: string,
  available: number | null,
): Promise<StockResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
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


type PhotoResult = { ok: true; assets: { id: string; url: string; alt: string | null }[] } | { ok: false; error: string };

/**
 * TUL-1271 #1 — set an item's photos (cover first). The item must be this
 * workspace's own row, and every photo must be a live asset of this workspace
 * (uploaded through the tenant library), so an id from another business is refused.
 */
export async function setWorkspaceItemPhotos(
  tenantId: string,
  offeringId: string,
  mediaAssetIds: string[],
): Promise<PhotoResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const auth = await authorizeForWorkspace(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const { data: own } = await offeringsTable(admin)
      .select("id")
      .eq("id", offeringId)
      .eq("tenant_id", tenantId)
      .eq("owner_kind", "workspace")
      .maybeSingle();
    if (!own) return { ok: false, error: "Not found." };

    // An event's backing row belongs to Events; same guard as every other workspace write.
    if (await isEventOfferingId(admin, tenantId, offeringId)) {
      return { ok: false, error: "This item belongs to an event. Edit it under Events." };
    }

    const wanted = nextPhotoIds(mediaAssetIds, {}).slice(0, MAX_ITEM_PHOTOS);
    if (wanted.length > 0) {
      const { data: mine, error: ownErr } = await admin
        .from("media_assets")
        .select("id, mime_type")
        .in("id", wanted)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
      if (ownErr) {
        logServerError("menu.offerings.photoOwner", ownErr);
        return { ok: false, error: "Failed to update photos." };
      }
      const owned = new Map(((mine ?? []) as unknown as { id: string; mime_type: string | null }[]).map((m): [string, string | null] => [m.id, m.mime_type]));
      if (wanted.some((id) => !owned.has(id))) return { ok: false, error: "One of those photos is not in your library." };
      // Photos only: a document or video id must not become a picture.
      if (wanted.some((id) => { const mt = owned.get(id); return typeof mt === "string" && mt !== "" && !mt.startsWith("image/"); })) {
        return { ok: false, error: "Only images can be item photos." };
      }
    }

    // Insert-then-remove (never remove-then-insert): a failed write leaves the OLD photos in place
    // instead of none. The upsert also rewrites sort_order for photos that stay.
    if (wanted.length > 0) {
      const { error: upErr } = await admin.from("talent_offering_media").upsert(
        wanted.map((mid, i) => ({ offering_id: offeringId, media_asset_id: mid, sort_order: i })),
        { onConflict: "offering_id,media_asset_id" },
      );
      if (upErr) {
        logServerError("menu.offerings.photoSet", upErr);
        return { ok: false, error: "Failed to update photos." };
      }
    }
    const stale = admin.from("talent_offering_media").delete().eq("offering_id", offeringId);
    const { error: delErr } = wanted.length > 0 ? await stale.not("media_asset_id", "in", `(${wanted.join(",")})`) : await stale;
    if (delErr) {
      logServerError("menu.offerings.photoClear", delErr);
      return { ok: false, error: "Failed to update photos." };
    }
    await afterMenuWrite(admin, tenantId, "photos");
    const assets = (await loadOfferingImageAssets(admin as unknown as SupabaseClient, [offeringId])).get(offeringId) ?? [];
    return { ok: true, assets };
  } catch (err) {
    logServerError("menu.offerings.photos", err);
    return { ok: false, error: "Unexpected error." };
  }
}


/**
 * TUL-1340 — the alt text of one of this workspace's photos (read by screen readers on the QR
 * menu and the site). The asset must be a live asset of this workspace; text is trimmed to 200.
 */
export async function setWorkspacePhotoAlt(
  tenantId: string,
  mediaAssetId: string,
  alt: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const auth = await authorizeForWorkspace(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    const clean = String(alt ?? "").trim().slice(0, 200);
    const { data, error } = await admin
      .from("media_assets")
      .update({ alt: clean || null })
      .eq("id", mediaAssetId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      logServerError("menu.offerings.photoAlt", error);
      return { ok: false, error: "Failed to save." };
    }
    if (!data || data.length === 0) return { ok: false, error: "Not found." };
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (err) {
    logServerError("menu.offerings.photoAlt", err);
    return { ok: false, error: "Unexpected error." };
  }
}
