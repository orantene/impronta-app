import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { scopeToSellableOfferings } from "@/lib/offerings/sellable";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { loadListings } from "./entries.server";
import { choicesForEntry } from "./entry-photos";
import { loadOfferingPhotoChoices } from "./entry-photos.server";
import { shapePublicEntries, type PublicEntry, type PublicEntryInput } from "./public-hub";

type Raw = Record<string, unknown>;

const missing = (e: { code?: string | null } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703");

/** Is this listing sellable right now? Only an explicit `true` from the database counts. */
async function isSellable(admin: SupabaseClient, listingId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("workspace_service_listing_is_sellable", { p_listing_id: listingId });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/**
 * The hub entries a visitor of THIS workspace's site may see (request-only). Scoped to the
 * host's tenant id by the caller; fails closed: any unreadable part means "nothing to show",
 * never a partial or other workspace's list. Missing tables (migrations not applied) = none.
 */
export async function loadPublicHubEntries(admin: SupabaseClient, hostTenantId: string): Promise<PublicEntry[]> {
  try {
    const { data: rows, error } = await tenantScopedQuery(admin, "workspace_service_entries", hostTenantId)
      .select("id, name, category, photo_media_id, hub_price_cents, currency, show_who, featured, hidden, own_offering_id")
      .eq("hidden", false);
    if (error) {
      if (!missing(error)) logServerError("serviceHub.public.entries", error);
      return [];
    }
    const entryRows = (rows ?? []) as Raw[];
    if (entryRows.length === 0) return [];
    const loaded = await loadListings(admin, hostTenantId);
    if (!loaded) return [];
    const accepted = loaded.listings.filter((l) => l.talentAccepted && l.entryId);
    const sellable = new Map<string, boolean>();
    await Promise.all(accepted.map(async (l) => sellable.set(l.listingId, await isSellable(admin, l.listingId))));

    const offeringsOf = (entryId: string, own: string | null) =>
      [...accepted.filter((l) => l.entryId === entryId).map((l) => loaded.offeringByListing.get(l.listingId) ?? ""), ...(own ? [own] : [])].filter(Boolean);
    const allOfferings = [...new Set(entryRows.flatMap((r) => offeringsOf(String(r.id), typeof r.own_offering_id === "string" ? r.own_offering_id : null)))];
    const photos = await loadOfferingPhotoChoices(admin, allOfferings);

    // The workspace's own service shows only while the guest storefront could sell it.
    const ownIds = [...new Set(entryRows.map((r) => r.own_offering_id).filter((v): v is string => typeof v === "string"))];
    const ownSellable = new Set<string>();
    if (ownIds.length > 0) {
      const { data: ownRows, error: ownErr } = await scopeToSellableOfferings(
        tenantScopedQuery(admin, "talent_offerings", hostTenantId).select("id").in("id", ownIds),
        "guest_request",
      );
      if (ownErr) {
        logServerError("serviceHub.public.own", ownErr);
        return [];
      }
      for (const o of (ownRows ?? []) as Raw[]) ownSellable.add(String(o.id));
    }

    const inputs: PublicEntryInput[] = entryRows.map((r) => {
      const ownRaw = typeof r.own_offering_id === "string" ? r.own_offering_id : null;
      const own = ownRaw && ownSellable.has(ownRaw) ? ownRaw : null;
      const choices = photos ? choicesForEntry(offeringsOf(String(r.id), own), photos) : [];
      const chosen = typeof r.photo_media_id === "string" ? choices.find((c) => c.mediaId === r.photo_media_id) : undefined;
      return {
        id: String(r.id),
        name: String(r.name ?? ""),
        category: typeof r.category === "string" ? r.category : null,
        // The chosen photo if it is still one of the entry's own, else the first one it has.
        photoUrl: (chosen ?? choices[0])?.url ?? null,
        hubPriceCents: typeof r.hub_price_cents === "number" ? r.hub_price_cents : r.hub_price_cents == null ? null : Number(r.hub_price_cents),
        currency: typeof r.currency === "string" ? r.currency : null,
        showWho: r.show_who === "portfolio" || r.show_who === "hidden" ? r.show_who : "name",
        featured: r.featured === true,
        hidden: r.hidden === true,
        ownOfferingId: own,
        members: accepted
          .filter((l) => l.entryId === String(r.id))
          .map((l) => ({ listingId: l.listingId, talentName: l.talentName, priceCents: l.priceCents, currency: l.currency, sellable: sellable.get(l.listingId) === true })),
      };
    });
    return shapePublicEntries(inputs);
  } catch (err) {
    logServerError("serviceHub.public.load", err);
    return [];
  }
}
