import "server-only";

import { getRequestLocale } from "@/i18n/request-locale";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { portalVisitWhen, type PortalVisitWhen } from "./portal-visit-when";
import { buildVisitZoneMap } from "./visit-zone";

export type PortalBookingFacts = { startsAt: string | null; bookingZone: string | null; talentZone: string | null };

/**
 * inquiry id -> the latest booking's start, booking zone and booking talent's hours zone, for
 * the workspace client portal. Drafts count: the client sees the visit as soon as it has a
 * time. Any failure leaves the inquiry out (the page keeps its date only).
 */
async function loadFacts(tenantId: string, inquiryIds: readonly string[]): Promise<Record<string, PortalBookingFacts>> {
  const admin = createServiceRoleClient();
  if (!admin || inquiryIds.length === 0) return {};
  const { data: bk, error } = await admin
    .from("agency_bookings")
    .select("source_inquiry_id, order_id, starts_at, timezone, created_at")
    .in("source_inquiry_id", [...inquiryIds])
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) {
    logServerError("clientPortal.visitWhen.bookings", error);
    return {};
  }
  const rows = ((bk ?? []) as Array<{ source_inquiry_id: string | null; order_id: string | null; starts_at: string | null; timezone: string | null }>).filter((r) => r.source_inquiry_id);
  const out: Record<string, PortalBookingFacts> = {};
  for (const r of rows) {
    const id = r.source_inquiry_id as string;
    if (!out[id]) out[id] = { startsAt: r.starts_at, bookingZone: r.timezone, talentZone: null };
  }
  const orderIds = [...new Set(rows.flatMap((r) => (r.order_id ? [r.order_id] : [])))];
  if (orderIds.length === 0) return out;
  const { data: ln, error: lnErr } = await admin.from("order_lines").select("order_id, offering_id").in("order_id", orderIds).not("offering_id", "is", null);
  if (lnErr) {
    logServerError("clientPortal.visitWhen.lines", lnErr);
    return out;
  }
  const lines = ((ln ?? []) as Array<{ order_id: string; offering_id: string | null }>).map((l) => ({ orderId: l.order_id, offeringId: l.offering_id }));
  const offeringIds = [...new Set(lines.flatMap((l) => (l.offeringId ? [l.offeringId] : [])))];
  if (offeringIds.length === 0) return out;
  const { data: of, error: ofErr } = await admin.from("talent_offerings").select("id, talent_profile_id").in("id", offeringIds);
  if (ofErr) {
    logServerError("clientPortal.visitWhen.offerings", ofErr);
    return out;
  }
  const offerings = ((of ?? []) as Array<{ id: string; talent_profile_id: string | null }>).map((o) => ({ id: o.id, talentId: o.talent_profile_id }));
  const talentIds = [...new Set(offerings.flatMap((o) => (o.talentId ? [o.talentId] : [])))];
  if (talentIds.length === 0) return out;
  const { data: hr, error: hrErr } = await admin.from("talent_booking_hours").select("talent_profile_id, timezone").in("talent_profile_id", talentIds);
  if (hrErr) {
    logServerError("clientPortal.visitWhen.hours", hrErr);
    return out;
  }
  const hours = ((hr ?? []) as Array<{ talent_profile_id: string; timezone: string | null }>).map((h) => ({ talentId: h.talent_profile_id, timezone: h.timezone }));
  const zones = buildVisitZoneMap({
    bookings: rows.flatMap((r) => (r.source_inquiry_id ? [{ inquiryId: r.source_inquiry_id, orderId: r.order_id }] : [])),
    lines, offerings, hours,
  });
  for (const [id, z] of Object.entries(zones)) if (out[id]) out[id].talentZone = z;
  return out;
}

/** inquiry id -> the visit's local date/time with its zone named (workspace zone is the last fallback). */
export async function loadPortalVisitWhenMap(tenantId: string, inquiryIds: readonly string[], locale: string): Promise<Record<string, PortalVisitWhen>> {
  const facts = await loadFacts(tenantId, inquiryIds);
  const ids = Object.keys(facts);
  if (ids.length === 0) return {};
  const admin = createServiceRoleClient();
  const { data: ag } = admin ? await admin.from("agencies").select("timezone").eq("id", tenantId).maybeSingle() : { data: null };
  const workspaceZone = (ag as { timezone?: string | null } | null)?.timezone ?? "UTC";
  const out: Record<string, PortalVisitWhen> = {};
  for (const id of ids) {
    const w = portalVisitWhen({ ...facts[id], workspaceZone, locale });
    if (w) out[id] = w;
  }
  return out;
}

/**
 * Same map, locale taken from the request. Never throws: outside a request (or on any failure)
 * the visit simply has no `when` and the page keeps its date only.
 */
export async function loadPortalVisitWhenMapForRequest(tenantId: string, inquiryIds: readonly string[]): Promise<Record<string, PortalVisitWhen>> {
  try {
    return await loadPortalVisitWhenMap(tenantId, inquiryIds, await getRequestLocale());
  } catch (err) {
    logServerError("clientPortal.visitWhen.request", err);
    return {};
  }
}
