import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { loadTalentEarningsWithSupabase } from "@/lib/talent/earnings";
import { calendarByChannel, type ChannelCalendarRow } from "./service-hub-calendar";
import { earningsByChannel, whereItsSold, type ChannelEarnings, type WhereSoldRow } from "./service-hub-channels";
import { appearingIn, isMissingRelation, soldListingsFromRows, type Appearance } from "./service-hub-channels-rows";

export type ServiceChannels = {
  service: { id: string; title: string; priceCents: number; currency: string };
  rows: WhereSoldRow[];
};

export type ServiceHubChannelsData =
  | {
      ok: true;
      /** False until the held listing / terms migrations are applied. */
      ready: boolean;
      appearances: Appearance[];
      services: ServiceChannels[];
      earnings: ChannelEarnings[];
      /** Upcoming holds and bookings labelled by channel. `ok: false` = the read failed (not "nothing coming up"). */
      calendar: { ok: true; rows: ChannelCalendarRow[] } | { ok: false };
    }
  | { ok: false };

/**
 * Everything the talent's "Where it's sold / Where you appear / Earnings by
 * channel" page needs. Runs as the talent (RLS lets her read her own listings and
 * terms; workspace names come from the same session). A failed read is
 * `{ ok: false }`, never an empty page that looks like "sold nowhere".
 */
export async function loadServiceHubChannels(
  supabase: SupabaseClient,
  talentProfileId: string,
  userId: string,
): Promise<ServiceHubChannelsData> {
  try {
    const [listingsRes, termsRes, offeringsRes] = await Promise.all([
      supabase
        .from("workspace_service_listings")
        .select("id, tenant_id, offering_id, status, price_mode, margin_bps, price_cents, currency, talent_lowest_cents")
        .eq("talent_profile_id", talentProfileId),
      supabase
        .from("workspace_talent_terms")
        .select("tenant_id, version, work_model, share_kind, share_bps, share_amount_cents, share_currency, status")
        .eq("talent_profile_id", talentProfileId),
      supabase
        .from("talent_offerings")
        .select("id, title, amount_cents, currency")
        .eq("talent_profile_id", talentProfileId)
        .not("amount_cents", "is", null),
    ]);
    if (offeringsRes.error) {
      logServerError("serviceHub.channels.offerings", offeringsRes.error);
      return { ok: false };
    }
    const missing = isMissingRelation(listingsRes.error) || isMissingRelation(termsRes.error);
    if ((listingsRes.error && !isMissingRelation(listingsRes.error)) || (termsRes.error && !isMissingRelation(termsRes.error))) {
      logServerError("serviceHub.channels.read", listingsRes.error ?? termsRes.error);
      return { ok: false };
    }
    const listings = (missing ? [] : (listingsRes.data ?? [])) as Array<Record<string, unknown>>;
    const terms = (missing ? [] : (termsRes.data ?? [])) as Array<Record<string, unknown>>;

    const tenantIds = [...new Set([...listings, ...terms].map((r) => String(r.tenant_id)).filter(Boolean))];
    const names = new Map<string, string>();
    if (tenantIds.length > 0) {
      const { data: agencies, error } = await supabase.from("agencies").select("id, display_name").in("id", tenantIds);
      // Names are cosmetic: a failed read falls back to the id, the numbers stand.
      if (error) logServerError("serviceHub.channels.names", error);
      for (const a of agencies ?? []) names.set(String(a.id), String(a.display_name ?? a.id));
    }

    const services: ServiceChannels[] = ((offeringsRes.data ?? []) as Array<Record<string, unknown>>).map((o) => {
      const currency = String(o.currency ?? "").toUpperCase();
      const priceCents = Number(o.amount_cents);
      return {
        service: { id: String(o.id), title: String(o.title ?? ""), priceCents, currency },
        rows: /^[A-Z]{3}$/.test(currency)
          ? whereItsSold(
              soldListingsFromRows({
                talentPriceCents: priceCents,
                currency,
                listings: listings.filter((l) => String(l.offering_id) === String(o.id)),
                terms,
                tenantNames: names,
              }),
            )
          : [],
      };
    });

    const calendar = await loadCalendar(supabase, talentProfileId, userId, names);
    const earnings = earningsByChannel((await loadTalentEarningsWithSupabase(supabase, talentProfileId)).rows);
    return { ok: true, ready: !missing, appearances: appearingIn({ terms, tenantNames: names }), services, earnings, calendar };
  } catch (err) {
    logServerError("serviceHub.channels", err);
    return { ok: false };
  }
}

/**
 * Upcoming holds and bookings of this talent, labelled by placing workspace. The
 * talent's own workspaces (she is owner) and the platform hub read as "My site /
 * hub". A failed read is `{ ok: false }`, never an empty calendar.
 */
async function loadCalendar(
  supabase: SupabaseClient,
  talentProfileId: string,
  userId: string,
  knownNames: Map<string, string>,
): Promise<{ ok: true; rows: ChannelCalendarRow[] } | { ok: false }> {
  const now = new Date();
  const fromIso = now.toISOString();
  const toIso = new Date(now.getTime() + 180 * 86_400_000).toISOString();
  const [holdsRes, bookingsRes, ownRes] = await Promise.all([
    supabase
      .from("talent_holds")
      .select("id, title, starts_at, ends_at, hold_strength, tenant_id, expires_at")
      .eq("talent_profile_id", talentProfileId)
      .gt("ends_at", fromIso)
      .lt("starts_at", toIso),
    supabase
      .from("talent_bookings")
      .select("id, title, starts_at, ends_at, status, tenant_id")
      .eq("talent_profile_id", talentProfileId)
      .gt("ends_at", fromIso)
      .lt("starts_at", toIso),
    supabase.from("agency_memberships").select("tenant_id").eq("profile_id", userId).eq("role", "owner"),
  ]);
  const err = holdsRes.error ?? bookingsRes.error ?? ownRes.error;
  if (err) {
    logServerError("serviceHub.channels.calendar", err);
    return { ok: false };
  }
  const holds = (holdsRes.data ?? []) as Array<Record<string, unknown>>;
  const bookings = (bookingsRes.data ?? []) as Array<Record<string, unknown>>;
  const tenantIds = [...new Set([...holds, ...bookings].map((r) => String(r.tenant_id)))];
  const hub = new Set<string>();
  const names = new Map(knownNames);
  if (tenantIds.length > 0) {
    const { data, error } = await supabase.from("agencies").select("id, display_name, kind").in("id", tenantIds);
    // Names are cosmetic, but the hub marker decides the label: without it, fail the whole read.
    if (error) {
      logServerError("serviceHub.channels.calendarTenants", error);
      return { ok: false };
    }
    for (const a of data ?? []) {
      names.set(String(a.id), String(a.display_name ?? a.id));
      if (a.kind === "hub") hub.add(String(a.id));
    }
  }
  const rows = calendarByChannel({
    now,
    ownTenantIds: new Set(((ownRes.data ?? []) as Array<{ tenant_id: string }>).map((r) => String(r.tenant_id))),
    hubTenantIds: hub,
    tenantNames: names,
    entries: [
      ...holds.map((h) => ({
        id: String(h.id),
        kind: "hold" as const,
        title: String(h.title ?? ""),
        startsAt: String(h.starts_at),
        endsAt: String(h.ends_at),
        tenantId: String(h.tenant_id),
        status: "held",
        holdStrength: h.hold_strength === "firm" ? ("firm" as const) : ("soft" as const),
        expiresAt: typeof h.expires_at === "string" ? h.expires_at : null,
      })),
      ...bookings.map((b) => ({
        id: String(b.id),
        kind: "booking" as const,
        title: String(b.title ?? ""),
        startsAt: String(b.starts_at),
        endsAt: String(b.ends_at),
        tenantId: String(b.tenant_id),
        status: String(b.status),
        holdStrength: null,
        expiresAt: null,
      })),
    ],
  });
  return { ok: true, rows };
}
