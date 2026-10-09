import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { buildVisitZoneMap } from "./visit-zone";

/**
 * Booking-talent zone for each visit in the LIST, in four batched reads (booking -> order line
 * -> offering -> talent booking hours). Any failure or gap leaves that visit out, so it shows in
 * the host tenant's zone as before. Tenant-scoped like every read in this area.
 */
export async function loadVisitZones(tenantId: string, inquiryIds: readonly string[]): Promise<Record<string, string>> {
  const admin = createServiceRoleClient();
  if (!admin || inquiryIds.length === 0) return {};

  const { data: bk, error: bkErr } = await admin
    .from("agency_bookings")
    .select("source_inquiry_id, order_id, created_at")
    .in("source_inquiry_id", [...inquiryIds])
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (bkErr) {
    logServerError("clientAccount.visitZones.bookings", bkErr);
    return {};
  }
  const bookings = ((bk ?? []) as Array<{ source_inquiry_id: string | null; order_id: string | null }>).flatMap((b) =>
    b.source_inquiry_id ? [{ inquiryId: b.source_inquiry_id, orderId: b.order_id }] : [],
  );
  const orderIds = [...new Set(bookings.flatMap((b) => (b.orderId ? [b.orderId] : [])))];
  if (orderIds.length === 0) return {};

  const { data: ln, error: lnErr } = await admin
    .from("order_lines")
    .select("order_id, offering_id")
    .in("order_id", orderIds)
    .not("offering_id", "is", null);
  if (lnErr) {
    logServerError("clientAccount.visitZones.lines", lnErr);
    return {};
  }
  const lines = ((ln ?? []) as Array<{ order_id: string; offering_id: string | null }>).map((l) => ({ orderId: l.order_id, offeringId: l.offering_id }));
  const offeringIds = [...new Set(lines.flatMap((l) => (l.offeringId ? [l.offeringId] : [])))];
  if (offeringIds.length === 0) return {};

  const { data: of, error: ofErr } = await admin.from("talent_offerings").select("id, talent_profile_id").in("id", offeringIds);
  if (ofErr) {
    logServerError("clientAccount.visitZones.offerings", ofErr);
    return {};
  }
  const offerings = ((of ?? []) as Array<{ id: string; talent_profile_id: string | null }>).map((o) => ({ id: o.id, talentId: o.talent_profile_id }));
  const talentIds = [...new Set(offerings.flatMap((o) => (o.talentId ? [o.talentId] : [])))];
  if (talentIds.length === 0) return {};

  const { data: hr, error: hrErr } = await admin.from("talent_booking_hours").select("talent_profile_id, timezone").in("talent_profile_id", talentIds);
  if (hrErr) {
    logServerError("clientAccount.visitZones.hours", hrErr);
    return {};
  }
  const hours = ((hr ?? []) as Array<{ talent_profile_id: string; timezone: string | null }>).map((h) => ({ talentId: h.talent_profile_id, timezone: h.timezone }));

  return buildVisitZoneMap({ bookings, lines, offerings, hours });
}
