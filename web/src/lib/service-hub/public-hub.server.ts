import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CATALOG_PROFILE_COLUMNS, isPublicCatalogProfile, type CatalogProfileRow } from "@/lib/offerings/business-catalog";
import { isSellable, scopeToSellableOfferings } from "@/lib/offerings/sellable";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { loadListings } from "./entries.server";
import { choicesForEntry } from "./entry-photos";
import { loadOfferingPhotoChoices } from "./entry-photos.server";
import { shapePublicEntries, type PublicEntry, type PublicEntryInput } from "./public-hub";

type Raw = Record<string, unknown>;

const ID_CHUNK = 100;
const RPC_BATCH = 8;
const MAX_RPC_LISTINGS = 200;

const missing = (e: { code?: string | null } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703");

/** Is this listing sellable right now? Only an explicit `true` from the database counts. */
async function isSellable_rpc(admin: SupabaseClient, listingId: string): Promise<boolean> {
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
    const acceptedAll = loaded.listings.filter((l) => l.talentAccepted && l.entryId);

    // (a0) TUL-1591: a talent who LEFT this workspace (no ACTIVE roster row here) leaves the
    // hub with her listings. Open bookings are not touched; this is the public list only.
    const memberIds = [...new Set(acceptedAll.map((l) => l.talentProfileId))];
    const activeMembers = new Set<string>();
    for (let i = 0; i < memberIds.length; i += ID_CHUNK) {
      const { data: roster, error: rErr } = await tenantScopedQuery(admin, "agency_talent_roster", hostTenantId)
        .select("tenant_id, talent_profile_id, status")
        .eq("status", "active")
        .in("talent_profile_id", memberIds.slice(i, i + ID_CHUNK));
      if (rErr) {
        logServerError("serviceHub.public.roster", rErr);
        return [];
      }
      for (const r of (roster ?? []) as Raw[]) if (r.tenant_id === hostTenantId && r.status === "active") activeMembers.add(String(r.talent_profile_id));
    }
    const accepted = acceptedAll.filter((l) => activeMembers.has(l.talentProfileId));
    const offeringOf = (listingId: string) => loaded.offeringByListing.get(listingId) ?? "";

    // (b) Only a PUBLIC talent's services appear: the directory's own rule (not deleted, not
    // hidden, listed, public). An unreadable check shows nothing.
    const talentIds = [...new Set(accepted.map((l) => l.talentProfileId))];
    const publicTalent = new Set<string>();
    for (let i = 0; i < talentIds.length; i += ID_CHUNK) {
      const { data: profs, error: pErr } = await admin.from("talent_profiles").select(CATALOG_PROFILE_COLUMNS).in("id", talentIds.slice(i, i + ID_CHUNK));
      if (pErr) {
        logServerError("serviceHub.public.talents", pErr);
        return [];
      }
      for (const p of (profs ?? []) as CatalogProfileRow[]) if (isPublicCatalogProfile(p)) publicTalent.add(p.id);
    }

    // (c) Each member offering must still be published + approved + public/on request.
    const memberOfferingIds = [...new Set(accepted.map((l) => offeringOf(l.listingId)).filter(Boolean))];
    const offeringOk = new Set<string>();
    for (let i = 0; i < memberOfferingIds.length; i += ID_CHUNK) {
      const { data: offs, error: oErr } = await admin.from("talent_offerings").select("id, status, moderation_state, visibility").in("id", memberOfferingIds.slice(i, i + ID_CHUNK));
      if (oErr) {
        logServerError("serviceHub.public.offerings", oErr);
        return [];
      }
      for (const o of (offs ?? []) as Raw[]) {
        if (isSellable({ status: o.status as string | null, moderation_state: o.moderation_state as string | null, visibility: o.visibility as string | null }, "guest_request")) offeringOk.add(String(o.id));
      }
    }

    // The database's sellable check runs only for what already passed the cheap checks, a few at a time.
    const candidates = accepted.filter((l) => publicTalent.has(l.talentProfileId) && offeringOk.has(offeringOf(l.listingId))).slice(0, MAX_RPC_LISTINGS);
    const sellable = new Map<string, boolean>();
    for (let i = 0; i < candidates.length; i += RPC_BATCH) {
      await Promise.all(candidates.slice(i, i + RPC_BATCH).map(async (l) => sellable.set(l.listingId, await isSellable_rpc(admin, l.listingId))));
    }
    const liveMembers = accepted.filter((l) => sellable.get(l.listingId) === true);

    const offeringsOf = (entryId: string, own: string | null, withMembers: boolean) =>
      [...(withMembers ? liveMembers.filter((l) => l.entryId === entryId).map((l) => offeringOf(l.listingId)) : []), ...(own ? [own] : [])].filter(Boolean);
    const allOfferings = [...new Set(entryRows.flatMap((r) => offeringsOf(String(r.id), typeof r.own_offering_id === "string" ? r.own_offering_id : null, r.show_who !== "hidden")))];
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
      // (a) A hidden entry never shows a member's photo; only the workspace's own service image.
      const showWho = r.show_who === "portfolio" || r.show_who === "hidden" ? r.show_who : "name";
      const choices = photos ? choicesForEntry(offeringsOf(String(r.id), own, showWho !== "hidden"), photos) : [];
      const chosen = typeof r.photo_media_id === "string" ? choices.find((c) => c.mediaId === r.photo_media_id) : undefined;
      return {
        id: String(r.id),
        name: String(r.name ?? ""),
        category: typeof r.category === "string" ? r.category : null,
        // The chosen photo if it is still one of the entry's own, else the first one it has.
        photoUrl: (chosen ?? choices[0])?.url ?? null,
        hubPriceCents: typeof r.hub_price_cents === "number" ? r.hub_price_cents : r.hub_price_cents == null ? null : Number(r.hub_price_cents),
        currency: typeof r.currency === "string" ? r.currency : null,
        showWho,
        featured: r.featured === true,
        hidden: r.hidden === true,
        ownOfferingId: own,
        members: accepted
          .filter((l) => l.entryId === String(r.id) && sellable.get(l.listingId) === true)
          .map((l) => ({ listingId: l.listingId, talentName: l.talentName, priceCents: l.priceCents, currency: l.currency, sellable: sellable.get(l.listingId) === true })),
      };
    });
    return shapePublicEntries(inputs);
  } catch (err) {
    logServerError("serviceHub.public.load", err);
    return [];
  }
}
