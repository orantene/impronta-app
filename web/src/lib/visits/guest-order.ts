import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { addLine, createDraftOrder } from "@/lib/pos/draft";
import { submitOrderToPreparation } from "@/lib/preparation/tickets";
import { createPaymentLink } from "@/lib/payments/links";
import { loadOpenVisitByToken } from "./qr";
import { sortGuestMenu, toGuestMenuItem, type GuestMenuItem, type GuestMenuRow } from "./guest-menu-item";
import { isGuestSellableOffering, scopeToGuestSellableOfferings } from "@/lib/offerings/guest-sellable";
import { isMissingColumnError } from "@/lib/pos/pos-enabled";
import { isOnTableQrMenu, TABLE_QR_COLUMN, withTableQrOnly } from "@/lib/offerings/table-qr";
import { anyNonMenuOffering, loadNonMenuOfferingIds, withoutNonMenuOfferings } from "@/lib/offerings/non-menu-offerings";
import type { VenueAdmin } from "@/lib/venues/locations";
import { guestVariantSellable, type GuestMenuOption } from "./guest-menu-options";

export type GuestReason =
  | "visit_closed"
  | "item_unavailable"
  | "already_paid"
  | "exceeds_outstanding"
  | "not_submitted"
  | "not_found"
  | "invalid"
  | "unavailable"
  | "conflict";

type GuestFail = { ok: false; reason: GuestReason };

async function openVisit(admin: VenueAdmin, tenantId: string, token: string) {
  const loaded = await loadOpenVisitByToken(admin, { tenantId, publicToken: token });
  if (!loaded.ok) {
    return { ok: false as const, reason: loaded.reason === "ended" ? ("visit_closed" as const) : loaded.reason === "not_found" ? ("not_found" as const) : ("unavailable" as const) };
  }
  return loaded;
}

/** Cover photo URL per offering (first by sort order); one query. */
async function loadCoverImages(admin: SupabaseClient, offeringIds: string[]): Promise<Map<string, { url: string; alt: string | null }>> {
  const out = new Map<string, { url: string; alt: string | null }>();
  if (offeringIds.length === 0) return out;
  const { data, error } = await admin
    .from("talent_offering_media")
    .select("offering_id, sort_order, media_assets:media_asset_id ( public_url, bucket_id, storage_path, alt )")
    .in("offering_id", offeringIds)
    .order("sort_order", { ascending: true });
  if (error) {
    // A failed photo read never hides the menu: no pictures, and the failure is logged.
    logServerError("visits.coverImages", error);
    return out;
  }
  type Media = { public_url: string | null; bucket_id: string | null; storage_path: string | null; alt?: string | null };
  for (const r of (data ?? []) as unknown as Array<{ offering_id: string; media_assets: Media | Media[] | null }>) {
    if (out.has(r.offering_id)) continue;
    const m = Array.isArray(r.media_assets) ? r.media_assets[0] : r.media_assets;
    if (!m) continue;
    const url =
      m.public_url ??
      (m.bucket_id === "media-public" && m.storage_path
        ? admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl
        : null);
    if (url) out.set(r.offering_id, { url, alt: typeof m.alt === "string" ? m.alt : null });
  }
  return out;
}

export async function guestVisitMenu(
  admin: VenueAdmin,
  input: { tenantId: string; token: string; locale?: string },
): Promise<{ ok: true; items: Array<GuestMenuItem & { options: GuestMenuOption[] }> } | GuestFail> {
  const visit = await openVisit(admin, input.tenantId, input.token);
  if (!visit.ok) return visit;
  // D-10: published AND approved AND public; tenant scoping is the .eq below.
  const MENU_COLUMNS =
    "id, title, description, amount_cents, prep_station_id, status, category, category_i18n, title_i18n, description_i18n, sort_order, inventory_qty, capacity_pool_id";
  const readMenu = (columns: string) =>
    scopeToGuestSellableOfferings(
      admin
        .from("talent_offerings")
        .select(columns)
        .eq("tenant_id", input.tenantId)
        // Workspace menu items only: a roster talent's service is not a dish.
        .eq("owner_kind", "workspace")
        // Sort BEFORE the cap, so the 200 that survive are the owner's first 200.
        .order("sort_order", { ascending: true }),
    ).limit(200);
  // TUL-1916: the QR menu hides items switched off for it. Before the column
  // exists the read falls back to the old columns and everything stays listed.
  const [first, nonMenu] = await Promise.all([readMenu(`${MENU_COLUMNS}, ${TABLE_QR_COLUMN}`), loadNonMenuOfferingIds(admin, input.tenantId)]);
  const { data, error } = first.error && isMissingColumnError(first.error) ? await readMenu(MENU_COLUMNS) : first;
  if (error || nonMenu.error) {
    logServerError("visits.guestVisitMenu", error ?? nonMenu.error);
    return { ok: false, reason: "unavailable" };
  }
  // TUL-1271 item 6: event-backing and reservation offerings are not menu items.
  const menuRows = withoutNonMenuOfferings(
    withTableQrOnly(((data ?? []) as unknown as Array<GuestMenuRow & { table_qr_enabled?: boolean | null }>).map((r) => ({ ...r, id: String(r.id) }))),
    nonMenu.ids,
  );
  // TUL-1348: the options (sizes) of each dish. Read per dish id; a failed read
  // hides the whole menu rather than show an option-priced dish at a wrong price.
  const optionsByItem = new Map<string, GuestMenuOption[]>();
  const ids = menuRows.map((r) => r.id);
  if (ids.length > 0) {
    const { data: variants, error: vErr } = await admin
      .from("talent_offering_variants")
      .select("id, offering_id, label, amount_cents, is_hidden, sort_order")
      .in("offering_id", ids)
      .order("sort_order", { ascending: true });
    if (vErr) {
      logServerError("visits.guestVisitMenu.options", vErr);
      return { ok: false, reason: "unavailable" };
    }
    for (const v of (variants ?? []) as Array<Record<string, unknown>>) {
      if (v.is_hidden === true) continue;
      const key = String(v.offering_id);
      const list = optionsByItem.get(key) ?? [];
      list.push({
        id: String(v.id),
        label: String(v.label ?? ""),
        amountCents: v.amount_cents == null ? null : Number(v.amount_cents),
      });
      optionsByItem.set(key, list);
    }
  }
  // TUL-1271 #5: the photo, in the guest's language, in the owner's order. A failed photo read
  // never hides the menu (the item simply has no picture).
  const images = await loadCoverImages(admin as unknown as SupabaseClient, menuRows.map((r) => r.id)).catch(() => new Map<string, { url: string; alt: string | null }>());
  const locale = input.locale ?? "en";
  return {
    ok: true,
    items: sortGuestMenu(menuRows.map((row) => toGuestMenuItem(row, locale, images.get(row.id)?.url ?? null, images.get(row.id)?.alt ?? null))).map((item) => ({
      ...item,
      options: optionsByItem.get(item.id) ?? [],
    })),
  };
}

async function guestDraft(
  admin: VenueAdmin,
  input: { tenantId: string; visitId: string; spaceId: string; actorUserId: string },
): Promise<{ ok: true; orderId: string; version: number } | GuestFail> {
  const { data, error } = await admin
    .from("orders")
    .select("id, version, status")
    .eq("tenant_id", input.tenantId)
    .eq("visit_id", input.visitId)
    .eq("source_channel", "guest_qr")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("visits.guestDraft", error);
    return { ok: false, reason: "unavailable" };
  }
  if (data) {
    const row = data as { id: string; version: number };
    return { ok: true, orderId: row.id, version: Number(row.version) || 1 };
  }
  const created = await createDraftOrder(admin, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    visitId: input.visitId,
    spaceId: input.spaceId,
    context: "guest_qr",
    sourceChannel: "guest_qr",
  });
  if (!created.ok) return { ok: false, reason: "unavailable" };
  return { ok: true, orderId: created.orderId, version: 1 };
}

export async function guestVisitAddLine(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    token: string;
    offeringId: string;
    variantId?: string | null;
    qty: number;
    note?: string | null;
    actorUserId: string;
  },
): Promise<{ ok: true; orderId: string } | GuestFail> {
  const visit = await openVisit(admin, input.tenantId, input.token);
  if (!visit.ok) return visit;
  const { data: visitRow, error: visitErr } = await admin
    .from("visits")
    .select("opened_by")
    .eq("id", visit.visitId)
    .maybeSingle();
  if (visitErr) return { ok: false, reason: "unavailable" };
  const actorUserId = input.actorUserId || String((visitRow as { opened_by?: string } | null)?.opened_by ?? "");
  if (!actorUserId) return { ok: false, reason: "unavailable" };
  const readOffering = (columns: string) =>
    admin.from("talent_offerings").select(columns).eq("id", input.offeringId).eq("tenant_id", input.tenantId).maybeSingle();
  const base = "id, status, moderation_state, visibility, title, amount_cents, currency";
  const firstRead = await readOffering(`${base}, ${TABLE_QR_COLUMN}`);
  const { data: offering, error } = firstRead.error && isMissingColumnError(firstRead.error) ? await readOffering(base) : firstRead;
  if (error) return { ok: false, reason: "unavailable" };
  const off = offering as unknown as { id: string; status: string; moderation_state?: string; visibility?: string; table_qr_enabled?: boolean | null } | null;
  // D-10: an id guessed from another surface must not add an unapproved or hidden service.
  if (!off || !isGuestSellableOffering(off)) return { ok: false, reason: "item_unavailable" };
  // TUL-1916: an item switched off for the table QR cannot be added by a guessed id.
  if (!isOnTableQrMenu(off)) return { ok: false, reason: "item_unavailable" };
  // TUL-1271 item 6: an event-backing or reservation id is not a menu item either (fails closed).
  if (await anyNonMenuOffering(admin, input.tenantId, [off.id])) return { ok: false, reason: "item_unavailable" };

  // [MONEY] A guest names a variant by id, so it is re-read here: it must be this
  // dish's, not hidden (staff-only, comp or test options stay unreachable from the
  // QR) and inside its sales window. The staff POS path is unchanged.
  if (input.variantId) {
    const { data: variant, error: variantErr } = await admin
      .from("talent_offering_variants")
      .select("id, offering_id, is_hidden, sales_from, sales_until")
      .eq("id", input.variantId)
      .eq("offering_id", off.id)
      .maybeSingle();
    if (variantErr) {
      logServerError("visits.guestVisitAddLine.variant", variantErr);
      return { ok: false, reason: "unavailable" };
    }
    const v = variant as { offering_id?: string; is_hidden?: boolean | null; sales_from?: string | null; sales_until?: string | null } | null;
    if (!guestVariantSellable(v, off.id, new Date())) return { ok: false, reason: "item_unavailable" };
  }

  const draft = await guestDraft(admin, {
    tenantId: input.tenantId,
    visitId: visit.visitId,
    spaceId: visit.spaceId,
    actorUserId,
  });
  if (!draft.ok) return draft;
  const added = await addLine(admin, {
    tenantId: input.tenantId,
    orderId: draft.orderId,
    expectedVersion: draft.version,
    line: {
      offeringId: off.id,
      variantId: input.variantId ?? null,
      units: input.qty,
    },
  });
  if (!added.ok) {
    if (added.reason === "invalid") return { ok: false, reason: "invalid" };
    if (added.reason === "conflict") return { ok: false, reason: "conflict" };
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, orderId: draft.orderId };
}

export async function guestVisitSubmit(
  admin: VenueAdmin,
  input: { tenantId: string; token: string },
): Promise<{ ok: true } | GuestFail> {
  const visit = await openVisit(admin, input.tenantId, input.token);
  if (!visit.ok) return visit;
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("visit_id", visit.visitId)
    .eq("source_channel", "guest_qr")
    .eq("status", "draft")
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  if (!data) return { ok: false, reason: "not_found" };
  const submitted = await submitOrderToPreparation(admin, {
    tenantId: input.tenantId,
    orderId: (data as { id: string }).id,
    destination: "table",
  });
  if (!submitted.ok) return { ok: false, reason: "unavailable" };
  return { ok: true };
}

export async function posLineOfferSubstitute(
  admin: VenueAdmin,
  input: { tenantId: string; lineId: string; substituteOfferingId: string },
): Promise<{ ok: true; id: string } | GuestFail> {
  const { data, error } = await admin.rpc("pos_line_offer_substitute", {
    p_tenant_id: input.tenantId,
    p_line_id: input.lineId,
    p_offered_offering_id: input.substituteOfferingId,
  });
  if (error) {
    logServerError("visits.posLineOfferSubstitute", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; id?: string };
  if (reply.ok === true && reply.id) return { ok: true, id: reply.id };
  if (reply.reason === "not_found" || reply.reason === "conflict") {
    return { ok: false, reason: reply.reason };
  }
  return { ok: false, reason: "unavailable" };
}

export async function guestVisitSubstituteAccept(
  admin: VenueAdmin,
  input: { tenantId: string; token: string; lineId: string; substituteOfferingId: string },
): Promise<{ ok: true } | GuestFail> {
  const visit = await openVisit(admin, input.tenantId, input.token);
  if (!visit.ok) return visit;
  const { data: offer, error } = await admin
    .from("order_line_substitute_offers")
    .select("id, offered_offering_id, status, line_id")
    .eq("tenant_id", input.tenantId)
    .eq("line_id", input.lineId)
    .eq("status", "offered")
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  const row = offer as { id: string; offered_offering_id: string } | null;
  if (!row || row.offered_offering_id !== input.substituteOfferingId) {
    return { ok: false, reason: "not_found" };
  }
  const { error: upErr } = await admin
    .from("order_line_substitute_offers")
    .update({ status: "accepted" })
    .eq("id", row.id);
  if (upErr) return { ok: false, reason: "unavailable" };
  return { ok: true };
}

export async function guestVisitPayShare(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    token: string;
    amountCents?: number;
    lineIds?: string[];
    actorUserId: string;
    publicOrigin: string;
    operationKey: string;
  },
): Promise<{ ok: true; url: string } | GuestFail> {
  const visit = await openVisit(admin, input.tenantId, input.token);
  if (!visit.ok) return visit;
  // D-149: the guest has no user of their own. The actor on the collection is
  // the operator who opened the table (`visits.opened_by`), and when the visit
  // names nobody it is NULL: an empty string is an invalid uuid, not an absent
  // one, and Postgres refused the reservation with 22P02 for every share.
  let actorUserId: string | null = input.actorUserId.trim() || null;
  if (!actorUserId) {
    const { data: visitRow, error: visitErr } = await admin
      .from("visits")
      .select("opened_by")
      .eq("id", visit.visitId)
      .maybeSingle();
    if (visitErr) return { ok: false, reason: "unavailable" };
    const openedBy = (visitRow as { opened_by?: string | null } | null)?.opened_by;
    actorUserId = typeof openedBy === "string" && openedBy.trim() ? openedBy : null;
  }
  const { data: orders, error } = await admin
    .from("orders")
    .select("id, total_cents")
    .eq("tenant_id", input.tenantId)
    .eq("visit_id", visit.visitId)
    .order("created_at", { ascending: true });
  if (error || !orders?.length) return { ok: false, reason: "not_found" };
  const order = orders[0] as { id: string; total_cents: number };
  let amount = input.amountCents ?? 0;
  if (input.lineIds?.length) {
    const { data: lines, error: lineErr } = await admin
      .from("order_lines")
      .select("id, total_cents")
      .eq("order_id", order.id)
      .in("id", input.lineIds);
    if (lineErr) return { ok: false, reason: "unavailable" };
    amount = ((lines ?? []) as { total_cents: number }[]).reduce((sum, l) => sum + Number(l.total_cents ?? 0), 0);
  }
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "invalid" };
  const minted = await createPaymentLink(admin, {
    tenantId: input.tenantId,
    orderId: order.id,
    amountCents: amount,
    idempotencyKey: input.operationKey,
    actorUserId,
    publicOrigin: input.publicOrigin,
  });
  if (!minted.ok) {
    if (minted.reason === "exceeds_outstanding") return { ok: false, reason: "exceeds_outstanding" };
    if (minted.reason === "conflict") return { ok: false, reason: "already_paid" };
    return { ok: false, reason: minted.reason === "invalid" ? "invalid" : "unavailable" };
  }
  return { ok: true, url: minted.url };
}

export async function guestVisitBill(
  admin: VenueAdmin,
  input: { tenantId: string; token: string },
): Promise<
  | { ok: true; totalCents: number; paidCents: number; owedCents: number; currency: string }
  | GuestFail
> {
  const loaded = await loadOpenVisitByToken(admin, { tenantId: input.tenantId, publicToken: input.token });
  if (!loaded.ok) {
    return { ok: false, reason: loaded.reason === "ended" ? "visit_closed" : loaded.reason === "not_found" ? "not_found" : "unavailable" };
  }
  const { data: orders, error: orderErr } = await admin.from("orders").select("id").eq("visit_id", loaded.visitId);
  if (orderErr) return { ok: false, reason: "unavailable" };
  const orderIds = ((orders ?? []) as { id: string }[]).map((o) => o.id);
  let paidCents = 0;
  if (orderIds.length > 0) {
    const { data: paid, error } = await admin
      .from("booking_transactions")
      .select("gross_amount_cents, status, order_id")
      .in("order_id", orderIds)
      .in("status", ["paid", "payment_requested"]);
    if (error) return { ok: false, reason: "unavailable" };
    paidCents = ((paid ?? []) as { gross_amount_cents: number }[]).reduce(
      (sum, t) => sum + Number(t.gross_amount_cents ?? 0),
      0,
    );
  }
  const owedCents = Math.max(0, loaded.totalCents - paidCents);
  return {
    ok: true,
    totalCents: loaded.totalCents,
    paidCents,
    owedCents,
    currency: loaded.currency,
  };
}
