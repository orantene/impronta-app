import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { addLine, createDraftOrder } from "@/lib/pos/draft";
import { submitOrderToPreparation } from "@/lib/preparation/tickets";
import { createPaymentLink } from "@/lib/payments/links";
import { loadOpenVisitByToken } from "./qr";
import type { VenueAdmin } from "@/lib/venues/locations";

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

export async function guestVisitMenu(
  admin: VenueAdmin,
  input: { tenantId: string; token: string },
): Promise<{ ok: true; items: Array<{ id: string; title: string; amountCents: number; prepStationId: string | null }> } | GuestFail> {
  const visit = await openVisit(admin, input.tenantId, input.token);
  if (!visit.ok) return visit;
  const { data, error } = await admin
    .from("talent_offerings")
    .select("id, title, amount_cents, prep_station_id, status")
    .eq("tenant_id", input.tenantId)
    .eq("status", "published")
    .limit(200);
  if (error) {
    logServerError("visits.guestVisitMenu", error);
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    items: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      amountCents: Number(row.amount_cents ?? 0),
      prepStationId: row.prep_station_id ? String(row.prep_station_id) : null,
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
  const { data: visitRow } = await admin
    .from("visits")
    .select("opened_by")
    .eq("id", visit.visitId)
    .maybeSingle();
  const actorUserId = input.actorUserId || String((visitRow as { opened_by?: string } | null)?.opened_by ?? "");
  if (!actorUserId) return { ok: false, reason: "unavailable" };
  const { data: offering, error } = await admin
    .from("talent_offerings")
    .select("id, status, title, amount_cents, currency")
    .eq("id", input.offeringId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  const off = offering as { id: string; status: string } | null;
  if (!off || off.status !== "published") return { ok: false, reason: "item_unavailable" };

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
    actorUserId: input.actorUserId,
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
  const { data: orders } = await admin.from("orders").select("id").eq("visit_id", loaded.visitId);
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
