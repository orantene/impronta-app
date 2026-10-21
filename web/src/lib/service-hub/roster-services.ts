import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CATALOG_PROFILE_COLUMNS, isPublicCatalogProfile, type CatalogProfileRow } from "@/lib/offerings/business-catalog";
import { isSellable } from "@/lib/offerings/sellable";
import { logServerError } from "@/lib/server/safe-error";

/**
 * TUL-1372 (slice 1): the READER for roster services on a workspace's public site.
 *
 * Accepted listing links (`workspace_service_listings`, TUL-1367: talent x workspace x
 * service) become card-ready items for the site menu, the Services widget, the catalog
 * page and the directory filters. Roster services stay hidden everywhere else
 * (`workspace-offering-scope.ts` is unchanged).
 *
 * LEAK RULES (the #4101 lesson): every listing read is `tenant_id = <this workspace>`
 * AND re-checked in code; a talent in two workspaces only ever shows the entries THIS
 * workspace listed. A listing is shown only when ALL hold, and any failure hides it:
 *   - status is accepted AND the database says it is sellable
 *     (`workspace_service_listing_is_sellable`: not breached, no currency stop, the
 *     consented terms still accepted);
 *   - the talent is still an ACTIVE roster talent of this workspace;
 *   - the service is published + approved AND belongs to the listing's talent.
 *
 * Show-who and contact hiding are per entry: `hidden` returns no talent id or name,
 * `portfolio` returns the id but no name. The item carries `clientContact`, never a
 * phone or email.
 *
 * NOTE: the client price here mirrors `listingClientPriceCents` in
 * `service-hub/listing.ts` (TUL-1367, #4159). It is DISPLAY ONLY (checkout reads
 * its own price); swap this for the shared helper once #4159 is on main.
 */

type Admin = Pick<SupabaseClient, "from" | "rpc">;

export type RosterServiceItem = {
  listingId: string;
  offeringId: string;
  title: string;
  /** null when the entry hides the talent. */
  talentProfileId: string | null;
  /** only when show-who is "name". */
  talentName: string | null;
  /** null for a quote-only service (no number to show). */
  priceCents: number | null;
  priceIsFrom: boolean;
  /** the service's own currency */
  currency: string;
  bookingType: "request" | "instant";
  clientContact: "workspace" | "talent";
};

type ListingRow = {
  id: string;
  tenant_id: string;
  talent_profile_id: string;
  offering_id: string;
  status: string;
  price_mode: "talent_price" | "margin" | "fixed" | "from";
  margin_bps: number | null;
  price_cents: number | null;
  currency: string;
  show_who: "name" | "portfolio" | "hidden";
  client_contact: "workspace" | "talent";
  booking_type: "request" | "instant";
};

/** What the client sees (display), in the service's currency. Null = quote-only service. */
export function rosterServicePriceCents(
  l: { priceMode: ListingRow["price_mode"]; marginBps: number | null; priceCents: number | null },
  talentPriceCents: number | null,
): number | null {
  if (talentPriceCents == null) return null;
  switch (l.priceMode) {
    case "talent_price":
      return talentPriceCents;
    case "margin":
      return talentPriceCents + Math.round((talentPriceCents * (l.marginBps ?? 0)) / 10000);
    default:
      return l.priceCents ?? null;
  }
}

/**
 * `tenantId` must be AUTHORIZED by the caller: staff of that tenant, or the public host's
 * resolved tenant. Never a client-supplied value (the public catalog route passes
 * `host.tenantId`). Show-who "portfolio" returns the talent profile id ON PURPOSE: portfolio
 * means show the talent's public profile.
 */
const SELLABLE_TTL_MS = 30_000;
const SELLABLE_CACHE_MAX = 500;
const sellableCache = new Map<string, { ok: boolean; at: number }>();

/** @internal tests only */
export function _resetRosterSellableCacheForTests(): void {
  sellableCache.clear();
}

async function sellableVerdict(admin: Admin, listingId: string): Promise<boolean> {
  const hit = sellableCache.get(listingId);
  if (hit && Date.now() - hit.at < SELLABLE_TTL_MS) return hit.ok;
  const { data, error } = await admin.rpc("workspace_service_listing_is_sellable", { p_listing_id: listingId });
  if (error) {
    logServerError("serviceHub.rosterServices.sellable", error);
    return false; // an error is never cached: the next render asks again
  }
  const ok = data === true;
  if (sellableCache.size >= SELLABLE_CACHE_MAX) sellableCache.clear();
  sellableCache.set(listingId, { ok, at: Date.now() });
  return ok;
}

export async function loadWorkspaceRosterServices(admin: Admin, tenantId: string): Promise<RosterServiceItem[]> {
  if (!tenantId) return [];

  const { data: raw, error } = await admin
    .from("workspace_service_listings")
    .select("id, tenant_id, talent_profile_id, offering_id, status, price_mode, margin_bps, price_cents, currency, show_who, client_contact, booking_type")
    .eq("tenant_id", tenantId)
    .eq("status", "accepted")
    .order("created_at", { ascending: true });
  if (error) {
    // Held migration not applied yet, or a read failure: show nothing, never guess.
    logServerError("serviceHub.rosterServices.listings", error);
    return [];
  }
  // Re-check the tenant in code: the query is the first line, this is the second.
  const listings = ((raw ?? []) as ListingRow[]).filter((l) => l.tenant_id === tenantId && l.status === "accepted");
  if (listings.length === 0) return [];

  // The database decides sellable. Any error or false hides the entry. The checks run in parallel
  // and verdicts are cached briefly per listing (SELLABLE_TTL_MS), so a public page render does not
  // repeat one RPC per listing on every visit. A revoked listing can therefore linger up to the TTL.
  // TODO(TUL-1372): replace with one set-returning sellable RPC once the listing table is applied.
  const verdicts = await Promise.all(listings.map(async (l) => [l.id, await sellableVerdict(admin, l.id)] as const));
  const sellable = new Set(verdicts.filter(([, ok]) => ok).map(([id]) => id));
  const live = listings.filter((l) => sellable.has(l.id));
  if (live.length === 0) return [];

  const talentIds = [...new Set(live.map((l) => l.talent_profile_id))];
  const { data: rosterRows, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id, status")
    .eq("tenant_id", tenantId)
    .in("talent_profile_id", talentIds);
  if (rosterErr) {
    logServerError("serviceHub.rosterServices.roster", rosterErr);
    return [];
  }
  const active = new Set(
    ((rosterRows ?? []) as Array<{ talent_profile_id: string; status: string }>).filter((r) => r.status === "active").map((r) => r.talent_profile_id),
  );

  const offeringIds = [...new Set(live.map((l) => l.offering_id))];
  const { data: offerings, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, talent_profile_id, title, amount_cents, currency, status, moderation_state, visibility")
    .in("id", offeringIds);
  if (offErr) {
    logServerError("serviceHub.rosterServices.offerings", offErr);
    return [];
  }
  const offeringById = new Map(
    ((offerings ?? []) as Array<{ id: string; talent_profile_id: string | null; title: string | null; amount_cents: number | null; currency: string | null; status: string; moderation_state: string; visibility?: string | null }>).map((o) => [o.id, o]),
  );

  // PRIVACY: EVERY entry is shown only while its talent passes the same public-directory predicate the
  // directory and the catalog API use. A talent hidden from the directory is never named OR sold
  // anonymously, whichever flag hides them; the entry is dropped. Show-who only controls the name.
  const namedTalentIds = [...new Set(live.map((l) => l.talent_profile_id))];
  const names = new Map<string, string>();
  const publicTalent = new Set<string>();
  if (namedTalentIds.length > 0) {
    const { data: people, error: nameErr } = await admin
      .from("talent_profiles")
      .select(`${CATALOG_PROFILE_COLUMNS}, display_name`)
      .in("id", namedTalentIds);
    if (nameErr) {
      // Unknown visibility is not a yes: no entry is shown.
      logServerError("serviceHub.rosterServices.names", nameErr);
    } else {
      for (const p of (people ?? []) as unknown as Array<CatalogProfileRow & { display_name: string | null }>) {
        if (!isPublicCatalogProfile(p)) continue;
        publicTalent.add(p.id);
        if (p.display_name?.trim()) names.set(p.id, p.display_name.trim());
      }
    }
  }

  const out: RosterServiceItem[] = [];
  for (const l of live) {
    const o = offeringById.get(l.offering_id);
    if (!o || o.talent_profile_id !== l.talent_profile_id) continue; // the service must belong to the listing's talent
    // Published + approved via the one sell rule (no visibility filter, unchanged from #4171; see PM note).
    if (!isSellable(o, "staff_quote")) continue;
    if (!active.has(l.talent_profile_id)) continue;
    // Show-who only controls the NAME: anonymous selling of a hidden talent is not allowed either.
    if (!publicTalent.has(l.talent_profile_id)) continue;
    // Fail closed: no currency means no honest label for the price, so the item is skipped.
    const currency = (l.currency || o.currency || "").trim().toUpperCase();
    if (!currency) continue;
    out.push({
      listingId: l.id,
      offeringId: l.offering_id,
      title: o.title?.trim() || "Service",
      talentProfileId: l.show_who === "hidden" ? null : l.talent_profile_id,
      talentName: l.show_who === "name" ? names.get(l.talent_profile_id) ?? null : null,
      // D-10a: an on-request service shows no price (a quote), whatever its listing price mode.
      priceCents:
        o.visibility === "on_request"
          ? null
          : rosterServicePriceCents({ priceMode: l.price_mode, marginBps: l.margin_bps, priceCents: l.price_cents }, o.amount_cents),
      priceIsFrom: l.price_mode === "from",
      currency,
      bookingType: l.booking_type,
      clientContact: l.client_contact,
    });
  }
  return out;
}
