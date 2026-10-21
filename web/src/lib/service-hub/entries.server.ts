import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import {
  canJoinEntry,
  mergeCheck,
  perTalentDifferences,
  reviewQueue,
  splitCheck,
  suggestGroups,
  type Difference,
  type EntryListing,
  type GroupBlocker,
  type GroupSuggestion,
  type QueueItem,
} from "./entries";
import { hubRolesFromMembership, can, validateEntryPatch, type HubRole } from "./entry-permissions";
import { listingFromRows } from "./entries-rows";
import { choicesForEntry, photoChoiceAllowed, type PhotoChoice } from "./entry-photos";
import { loadOfferingPhotoChoices } from "./entry-photos.server";

/**
 * Reads and writes of the owner's service hub (TUL-1369). Service-role client, so
 * EVERY query is tenant scoped and every write re-checks the team role and
 * re-validates against the database rows (the screen is never trusted). A failed
 * read is `ok: false`, never an empty hub.
 */

type Raw = Record<string, unknown>;

export type HubEntry = {
  id: string;
  name: string;
  category: string | null;
  photoMediaId: string | null;
  /** The photos of the services inside this entry; the owner picks one. Empty when unreadable. */
  photoChoices: PhotoChoice[];
  bookingType: "request" | "instant";
  hubPriceCents: number | null;
  currency: string | null;
  showWho: "name" | "portfolio" | "hidden";
  clientContact: "workspace" | "talent";
  featured: boolean;
  hidden: boolean;
  ownOfferingId: string | null;
  members: EntryListing[];
  differences: Difference[];
};

export type OwnServiceOption = { offeringId: string; title: string };

export type OwnerHub =
  | {
      ok: true;
      /** False until the held entries migration is applied. */
      ready: boolean;
      entries: HubEntry[];
      queue: QueueItem[];
      suggestions: GroupSuggestion[];
      ownServices: OwnServiceOption[];
    }
  | { ok: false };

const isMissing = (e: { code?: string | null } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703");

export async function resolveHubRoles(admin: SupabaseClient, tenantId: string, userId: string): Promise<HubRole[] | "unreadable"> {
  const { data, error } = await tenantScopedQuery(admin, "agency_memberships", tenantId)
    .select("role")
    .eq("profile_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    logServerError("serviceHub.entries.role", error);
    return "unreadable";
  }
  return hubRolesFromMembership((data as { role?: string } | null)?.role);
}

export type LoadedListings = { listings: EntryListing[]; offeringByListing: Map<string, string> };

export async function loadListings(admin: SupabaseClient, tenantId: string): Promise<LoadedListings | null> {
  const { data: rows, error } = await tenantScopedQuery(admin, "workspace_service_listings", tenantId).select(
    "id, tenant_id, talent_profile_id, offering_id, status, price_mode, margin_bps, price_cents, currency, booking_type, entry_id, owner_skipped_at",
  );
  if (error) {
    if (isMissing(error)) return { listings: [], offeringByListing: new Map() };
    logServerError("serviceHub.entries.listings", error);
    return null;
  }
  const listings = (rows ?? []) as Raw[];
  const offeringIds = [...new Set(listings.map((l) => String(l.offering_id)))];
  const talentIds = [...new Set(listings.map((l) => String(l.talent_profile_id)))];
  const offerings = new Map<string, Raw>();
  const names = new Map<string, string>();
  if (offeringIds.length > 0) {
    // Offerings of a talent are not owned by this tenant: read by id (the listing already ties them to it).
    const { data, error: oErr } = await admin.from("talent_offerings").select("id, title, category, duration_minutes, amount_cents, currency").in("id", offeringIds);
    if (oErr) {
      logServerError("serviceHub.entries.offerings", oErr);
      return null;
    }
    for (const o of (data ?? []) as Raw[]) offerings.set(String(o.id), o);
  }
  if (talentIds.length > 0) {
    const { data, error: tErr } = await admin.from("talent_profiles").select("id, display_name, first_name, last_name").in("id", talentIds);
    if (tErr) {
      logServerError("serviceHub.entries.talents", tErr);
      return null;
    }
    for (const t of (data ?? []) as Raw[]) {
      names.set(String(t.id), String(t.display_name ?? `${t.first_name ?? ""} ${t.last_name ?? ""}`).trim() || String(t.id));
    }
  }
  const out: EntryListing[] = [];
  const offeringByListing = new Map<string, string>();
  for (const l of listings) {
    const mapped = listingFromRows(l, offerings.get(String(l.offering_id)) ?? {}, names.get(String(l.talent_profile_id)) ?? "");
    if (mapped) {
      out.push(mapped);
      offeringByListing.set(mapped.listingId, String(l.offering_id));
    }
  }
  return { listings: out, offeringByListing };
}

export async function loadOwnerHub(admin: SupabaseClient, tenantId: string): Promise<OwnerHub> {
  try {
    const entriesRes = await tenantScopedQuery(admin, "workspace_service_entries", tenantId).select(
      "id, name, category, photo_media_id, booking_type, hub_price_cents, currency, show_who, client_contact, featured, hidden, own_offering_id",
    );
    const missing = isMissing(entriesRes.error);
    if (entriesRes.error && !missing) {
      logServerError("serviceHub.entries.read", entriesRes.error);
      return { ok: false };
    }
    const loaded = await loadListings(admin, tenantId);
    if (!loaded) return { ok: false };
    const { listings, offeringByListing } = loaded;

    const rows = (missing ? [] : (entriesRes.data ?? [])) as Raw[];
    const offeringsOf = (entryId: string, own: string | null) => [
      ...listings.filter((l) => l.entryId === entryId).map((l) => offeringByListing.get(l.listingId) ?? ""),
      ...(own ? [own] : []),
    ].filter(Boolean);
    const photoByOffering = await loadOfferingPhotoChoices(admin, [...new Set(rows.flatMap((r) => offeringsOf(String(r.id), typeof r.own_offering_id === "string" ? r.own_offering_id : null)))]);
    const entries: HubEntry[] = rows.map((r) => {
      const members = listings.filter((l) => l.entryId === String(r.id));
      return {
        id: String(r.id),
        name: String(r.name ?? ""),
        category: typeof r.category === "string" ? r.category : null,
        photoMediaId: typeof r.photo_media_id === "string" ? r.photo_media_id : null,
        photoChoices: photoByOffering ? choicesForEntry(offeringsOf(String(r.id), typeof r.own_offering_id === "string" ? r.own_offering_id : null), photoByOffering) : [],
        bookingType: r.booking_type === "instant" ? "instant" : "request",
        hubPriceCents: typeof r.hub_price_cents === "number" ? r.hub_price_cents : r.hub_price_cents == null ? null : Number(r.hub_price_cents),
        currency: typeof r.currency === "string" ? r.currency : null,
        showWho: r.show_who === "portfolio" || r.show_who === "hidden" ? r.show_who : "name",
        clientContact: r.client_contact === "talent" ? "talent" : "workspace",
        featured: r.featured === true,
        hidden: r.hidden === true,
        ownOfferingId: typeof r.own_offering_id === "string" ? r.own_offering_id : null,
        members,
        differences: perTalentDifferences(members),
      };
    });

    const { data: own, error: ownErr } = await tenantScopedQuery(admin, "talent_offerings", tenantId)
      .select("id, title")
      .eq("owner_kind", "workspace");
    if (ownErr) {
      logServerError("serviceHub.entries.own", ownErr);
      return { ok: false };
    }
    const taken = new Set(entries.map((e) => e.ownOfferingId).filter(Boolean));
    const ownServices = ((own ?? []) as Raw[])
      .filter((o) => !taken.has(String(o.id)))
      .map((o) => ({ offeringId: String(o.id), title: String(o.title ?? "") }));

    return {
      ok: true,
      ready: !missing,
      entries,
      queue: reviewQueue(listings, entries.map((e) => ({ entryId: e.id, listings: e.members }))),
      suggestions: suggestGroups(listings),
      ownServices,
    };
  } catch (err) {
    logServerError("serviceHub.entries.load", err);
    return { ok: false };
  }
}

/* ─── Writes ───────────────────────────────────────────────────────────── */

export type HubWriteResult =
  | { ok: true; entryId?: string }
  | {
      ok: false;
      reason: "not_allowed" | "not_found" | "invalid" | "unavailable" | "not_ready" | "blocked";
      blockers?: Array<GroupBlocker | "already_member" | "empty">;
      fields?: string[];
    };

type Ctx = { admin: SupabaseClient; tenantId: string; userId: string };

async function guard(ctx: Ctx, action: Parameters<typeof can>[1]): Promise<HubRole[] | HubWriteResult> {
  const roles = await resolveHubRoles(ctx.admin, ctx.tenantId, ctx.userId);
  if (roles === "unreadable") return { ok: false, reason: "unavailable" };
  if (!can(roles, action)) return { ok: false, reason: "not_allowed" };
  return roles;
}
const isResult = (v: HubRole[] | HubWriteResult): v is HubWriteResult => !Array.isArray(v);

async function listingById(ctx: Ctx, listingId: string): Promise<EntryListing | "unreadable" | null> {
  const all = (await loadListings(ctx.admin, ctx.tenantId))?.listings;
  if (!all) return "unreadable";
  return all.find((l) => l.listingId === listingId) ?? null;
}

async function membersOf(ctx: Ctx, entryId: string): Promise<EntryListing[] | "unreadable"> {
  const all = (await loadListings(ctx.admin, ctx.tenantId))?.listings;
  if (!all) return "unreadable";
  return all.filter((l) => l.entryId === entryId);
}

async function entryExists(ctx: Ctx, entryId: string): Promise<boolean | "unreadable"> {
  const { data, error } = await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId).select("id").eq("id", entryId).maybeSingle();
  if (error) {
    logServerError("serviceHub.entries.exists", error);
    return "unreadable";
  }
  return !!data;
}

async function rawOfferingCategory(ctx: Ctx, listingId: string): Promise<string | null> {
  const { data } = await tenantScopedQuery(ctx.admin, "workspace_service_listings", ctx.tenantId).select("offering_id").eq("id", listingId).maybeSingle();
  const offeringId = (data as { offering_id?: string } | null)?.offering_id;
  if (!offeringId) return null;
  const { data: off, error: offErr } = await ctx.admin.from("talent_offerings").select("category").eq("id", offeringId).maybeSingle();
  if (offErr) logServerError("serviceHub.entries.offeringCategory", offErr);
  const c = (off as { category?: string | null } | null)?.category;
  return typeof c === "string" && c.trim() ? c.trim().slice(0, 120) : null;
}

export async function decideQueueItem(
  ctx: Ctx,
  input: { listingId: string; decision: { kind: "accept_into_group"; entryId: string } | { kind: "new_entry" } | { kind: "skip" } },
): Promise<HubWriteResult> {
  const g = await guard(ctx, "queue_decide");
  if (isResult(g)) return g;
  const listing = await listingById(ctx, input.listingId);
  if (listing === "unreadable") return { ok: false, reason: "unavailable" };
  // Only what the talent accepted and no entry holds yet is in the queue.
  if (!listing || listing.entryId != null || !listing.talentAccepted) return { ok: false, reason: "not_found" };

  const setListing = (patch: Raw) => tenantScopedQuery(ctx.admin, "workspace_service_listings", ctx.tenantId).update(patch).eq("id", listing.listingId).select("id").maybeSingle();

  if (input.decision.kind === "skip") {
    const { data, error } = await setListing({ owner_skipped_at: new Date().toISOString() });
    if (error) return isMissing(error) ? { ok: false, reason: "not_ready" } : (logServerError("serviceHub.entries.skip", error), { ok: false, reason: "unavailable" });
    return data ? { ok: true } : { ok: false, reason: "not_found" };
  }

  if (input.decision.kind === "accept_into_group") {
    const entryId = input.decision.entryId;
    const exists = await entryExists(ctx, entryId);
    if (exists === "unreadable") return { ok: false, reason: "unavailable" };
    if (!exists) return { ok: false, reason: "not_found" };
    const members = await membersOf(ctx, entryId);
    if (members === "unreadable") return { ok: false, reason: "unavailable" };
    const check = canJoinEntry(members, listing);
    if (!check.ok) return { ok: false, reason: "blocked", blockers: check.blockers };
    const { data, error } = await setListing({ entry_id: entryId });
    if (error) return isMissing(error) ? { ok: false, reason: "not_ready" } : (logServerError("serviceHub.entries.accept", error), { ok: false, reason: "unavailable" });
    return data ? { ok: true, entryId } : { ok: false, reason: "not_found" };
  }

  // new entry from this listing
  const { data: created, error: cErr } = await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId)
    .insert({
      name: listing.title.trim().slice(0, 120) || "Service",
      category: await rawOfferingCategory(ctx, listing.listingId),
      booking_type: listing.bookingType,
      currency: /^[A-Z]{3}$/.test(listing.currency) ? listing.currency : null,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (cErr || !created) {
    if (isMissing(cErr)) return { ok: false, reason: "not_ready" };
    logServerError("serviceHub.entries.create", cErr);
    return { ok: false, reason: "unavailable" };
  }
  const entryId = String((created as { id: string }).id);
  const { data, error } = await setListing({ entry_id: entryId });
  if (error || !data) {
    // Do not leave an empty entry behind.
    await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId).delete().eq("id", entryId);
    if (error) logServerError("serviceHub.entries.createAttach", error);
    return { ok: false, reason: error ? "unavailable" : "not_found" };
  }
  return { ok: true, entryId };
}

export async function mergeEntries(ctx: Ctx, input: { keepId: string; mergeId: string }): Promise<HubWriteResult> {
  const g = await guard(ctx, "group_edit");
  if (isResult(g)) return g;
  if (input.keepId === input.mergeId) return { ok: false, reason: "invalid" };
  const all = (await loadListings(ctx.admin, ctx.tenantId))?.listings;
  if (!all) return { ok: false, reason: "unavailable" };
  for (const id of [input.keepId, input.mergeId]) {
    const e = await entryExists(ctx, id);
    if (e === "unreadable") return { ok: false, reason: "unavailable" };
    if (!e) return { ok: false, reason: "not_found" };
  }
  // An entry backed by the workspace's own service cannot be folded into another.
  const { data: merged } = await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId).select("own_offering_id").eq("id", input.mergeId).maybeSingle();
  if ((merged as { own_offering_id?: string | null } | null)?.own_offering_id) return { ok: false, reason: "invalid" };
  const a = all.filter((l) => l.entryId === input.keepId);
  const b = all.filter((l) => l.entryId === input.mergeId);
  const check = mergeCheck(a, b);
  if (!check.ok) return { ok: false, reason: "blocked", blockers: check.blockers };
  const { error } = await tenantScopedQuery(ctx.admin, "workspace_service_listings", ctx.tenantId).update({ entry_id: input.keepId }).eq("entry_id", input.mergeId);
  if (error) {
    logServerError("serviceHub.entries.merge", error);
    return { ok: false, reason: "unavailable" };
  }
  await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId).delete().eq("id", input.mergeId);
  return { ok: true, entryId: input.keepId };
}

export async function splitEntry(ctx: Ctx, input: { entryId: string; listingIds: string[] }): Promise<HubWriteResult> {
  const g = await guard(ctx, "group_edit");
  if (isResult(g)) return g;
  const members = await membersOf(ctx, input.entryId);
  if (members === "unreadable") return { ok: false, reason: "unavailable" };
  if (members.length === 0) return { ok: false, reason: "not_found" };
  const check = splitCheck(members, input.listingIds);
  if (!check.ok) return { ok: false, reason: "invalid" };
  const { data: src } = await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId)
    .select("name, category, booking_type, currency, show_who, client_contact")
    .eq("id", input.entryId)
    .maybeSingle();
  if (!src) return { ok: false, reason: "not_found" };
  const first = members.find((m) => m.listingId === check.out[0])!;
  const { data: created, error } = await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId)
    .insert({
      name: first.title.trim().slice(0, 120) || String((src as Raw).name),
      category: (src as Raw).category ?? null,
      booking_type: (src as Raw).booking_type ?? "request",
      currency: (src as Raw).currency ?? null,
      show_who: (src as Raw).show_who ?? "name",
      client_contact: (src as Raw).client_contact ?? "workspace",
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    logServerError("serviceHub.entries.split", error);
    return { ok: false, reason: "unavailable" };
  }
  const newId = String((created as { id: string }).id);
  const { error: mErr } = await tenantScopedQuery(ctx.admin, "workspace_service_listings", ctx.tenantId).update({ entry_id: newId }).in("id", check.out);
  if (mErr) {
    await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId).delete().eq("id", newId);
    logServerError("serviceHub.entries.splitMove", mErr);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, entryId: newId };
}

/** The photos this entry may show: its listings' offerings plus its own service. Null = unreadable. */
async function entryPhotoChoices(admin: SupabaseClient, tenantId: string, entryId: string): Promise<PhotoChoice[] | null> {
  const { data: entry, error: eErr } = await tenantScopedQuery(admin, "workspace_service_entries", tenantId).select("own_offering_id").eq("id", entryId).maybeSingle();
  if (eErr || !entry) return null;
  const { data: rows, error: lErr } = await tenantScopedQuery(admin, "workspace_service_listings", tenantId).select("offering_id").eq("entry_id", entryId);
  if (lErr) return null;
  const ids = [...((rows ?? []) as Raw[]).map((r) => String(r.offering_id)), ...(typeof (entry as Raw).own_offering_id === "string" ? [String((entry as Raw).own_offering_id)] : [])];
  const by = await loadOfferingPhotoChoices(admin, ids);
  return by ? choicesForEntry(ids, by) : null;
}

export async function updateEntry(ctx: Ctx, input: { entryId: string; patch: Record<string, unknown> }): Promise<HubWriteResult> {
  const roles = await resolveHubRoles(ctx.admin, ctx.tenantId, ctx.userId);
  if (roles === "unreadable") return { ok: false, reason: "unavailable" };
  const checked = validateEntryPatch(input.patch, roles);
  if (!checked.ok) {
    return { ok: false, reason: checked.reason === "not_allowed" ? "not_allowed" : "invalid", fields: checked.fields };
  }
  const p = checked.patch;
  if (typeof p.photoMediaId === "string") {
    // A photo must be one of this entry's own members' photos; an unreadable check refuses.
    const choices = await entryPhotoChoices(ctx.admin, ctx.tenantId, input.entryId);
    if (!choices) return { ok: false, reason: "unavailable" };
    if (!photoChoiceAllowed(choices, p.photoMediaId)) return { ok: false, reason: "invalid", fields: ["photoMediaId"] };
  }
  const row: Raw = {};
  if (p.name !== undefined) row.name = p.name;
  if (p.categoryId !== undefined) row.category = p.categoryId;
  if (p.photoMediaId !== undefined) row.photo_media_id = p.photoMediaId;
  if (p.bookingType !== undefined) row.booking_type = p.bookingType;
  if (p.featured !== undefined) row.featured = p.featured;
  if (p.hidden !== undefined) row.hidden = p.hidden;
  if (p.hubPriceCents !== undefined) row.hub_price_cents = p.hubPriceCents;
  if (p.showWho !== undefined) row.show_who = p.showWho;
  if (p.clientContact !== undefined) row.client_contact = p.clientContact;
  row.updated_at = new Date().toISOString();
  const { data, error } = await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId).update(row).eq("id", input.entryId).select("id").maybeSingle();
  if (error) {
    if (isMissing(error)) return { ok: false, reason: "not_ready" };
    logServerError("serviceHub.entries.update", error);
    return { ok: false, reason: error.code === "23514" ? "invalid" : "unavailable" };
  }
  return data ? { ok: true, entryId: input.entryId } : { ok: false, reason: "not_found" };
}

/** The workspace's own service joins the same list as an entry. */
export async function addOwnService(ctx: Ctx, input: { offeringId: string }): Promise<HubWriteResult> {
  const g = await guard(ctx, "group_edit");
  if (isResult(g)) return g;
  const { data: off, error } = await tenantScopedQuery(ctx.admin, "talent_offerings", ctx.tenantId)
    .select("id, title, category, amount_cents, currency, owner_kind")
    .eq("id", input.offeringId)
    .maybeSingle();
  if (error) {
    logServerError("serviceHub.entries.own.read", error);
    return { ok: false, reason: "unavailable" };
  }
  const o = off as Raw | null;
  if (!o || o.owner_kind !== "workspace") return { ok: false, reason: "not_found" };
  const { data: created, error: cErr } = await tenantScopedQuery(ctx.admin, "workspace_service_entries", ctx.tenantId)
    .insert({
      name: String(o.title ?? "").trim().slice(0, 120) || "Service",
      category: typeof o.category === "string" && o.category.trim() ? o.category.trim().slice(0, 120) : null,
      hub_price_cents: typeof o.amount_cents === "number" ? o.amount_cents : null,
      currency: typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) ? o.currency : null,
      own_offering_id: input.offeringId,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (cErr || !created) {
    if (isMissing(cErr)) return { ok: false, reason: "not_ready" };
    // The unique index on (tenant, own_offering_id): already in the list.
    if (cErr?.code === "23505") return { ok: false, reason: "invalid" };
    logServerError("serviceHub.entries.own.create", cErr);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, entryId: String((created as { id: string }).id) };
}
