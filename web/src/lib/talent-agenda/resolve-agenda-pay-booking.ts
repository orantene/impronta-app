/**
 * Resolve the commercial agency_bookings row for agenda pay-link mint.
 *
 * Instant-book / vanity paths can leave talent_bookings.id ≠ agency_bookings.id.
 * Ownership still passes via the calendar mirror; money + order live on the
 * agency row linked by source_inquiry_id (and booking_talent on that id).
 */

import type { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { totalClientRevenueToCents } from "@/lib/money/total-client-revenue";

export const AGENDA_PAY_LINK_BOOKING_SELECT =
  "id, tenant_id, order_id, title, total_client_revenue, currency_code, payment_status, contact_name, contact_email, contact_phone";

export type AgendaPayLinkBookingRow = {
  id: string;
  tenant_id: string | null;
  order_id: string | null;
  title: string | null;
  total_client_revenue: number | string | null;
  currency_code: string | null;
  payment_status: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

export type AgendaCommercialCandidate = Pick<
  AgendaPayLinkBookingRow,
  "id" | "total_client_revenue" | "order_id" | "payment_status"
>;

/**
 * Only commercial rows this talent is on (booking_talent). Never fall back to
 * every booking sharing the inquiry — that can mint against someone else's row.
 * Among legs, prefer order then revenue so Soft Gel commercial money wins.
 */
export function pickAgendaCommercialBooking(
  candidates: AgendaCommercialCandidate[],
  talentLegBookingIds: ReadonlySet<string>,
): AgendaCommercialCandidate | null {
  if (candidates.length === 0) return null;
  const onLeg = candidates.filter((c) => talentLegBookingIds.has(c.id));
  if (onLeg.length === 0) return null;
  return (
    [...onLeg].sort((a, b) => {
      const aOrder = a.order_id ? 1 : 0;
      const bOrder = b.order_id ? 1 : 0;
      if (aOrder !== bOrder) return bOrder - aOrder;
      return (
        totalClientRevenueToCents(b.total_client_revenue) -
        totalClientRevenueToCents(a.total_client_revenue)
      );
    })[0] ?? null
  );
}

/**
 * Amount still owed on the commercial booking id (ledger money-in subtracted).
 * Callers must pass the agency_bookings id, never a diverged talent_bookings mirror.
 */
export function outstandingAgendaPayCents(input: {
  totalClientRevenue: number | string | null;
  paidCents: number;
}): number {
  const total = totalClientRevenueToCents(input.totalClientRevenue);
  const paid = Math.max(0, Math.round(input.paidCents) || 0);
  return Math.max(0, total - paid);
}

type AdminClient = NonNullable<ReturnType<typeof createServiceRoleClient>>;

export type ResolveAgendaPayLinkBookingResult =
  | { ok: true; row: AgendaPayLinkBookingRow }
  | { ok: false; reason: "not_found" | "unavailable" };

/**
 * Direct agency id first; when the UI booking id is a diverged talent_bookings
 * mirror, resolve via inquiry_id → agency_bookings.source_inquiry_id.
 */
export async function resolveAgendaPayLinkBooking(
  admin: AdminClient,
  input: { bookingId: string; talentId: string },
): Promise<ResolveAgendaPayLinkBookingResult> {
  const { data: direct, error } = await admin
    .from("agency_bookings")
    .select(AGENDA_PAY_LINK_BOOKING_SELECT)
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.createPayLink.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (direct) return { ok: true, row: direct as AgendaPayLinkBookingRow };

  const { data: mirror, error: mirrorErr } = await admin
    .from("talent_bookings")
    .select("id, inquiry_id")
    .eq("id", input.bookingId)
    .eq("talent_profile_id", input.talentId)
    .maybeSingle();
  if (mirrorErr) {
    logServerError("agenda.createPayLink.mirror", mirrorErr);
    return { ok: false, reason: "unavailable" };
  }
  const inquiryId =
    typeof mirror?.inquiry_id === "string" && mirror.inquiry_id.length > 0
      ? mirror.inquiry_id
      : null;
  if (!inquiryId) return { ok: false, reason: "not_found" };

  const { data: candidates, error: candErr } = await admin
    .from("agency_bookings")
    .select(AGENDA_PAY_LINK_BOOKING_SELECT)
    .eq("source_inquiry_id", inquiryId);
  if (candErr) {
    logServerError("agenda.createPayLink.inquiry", candErr);
    return { ok: false, reason: "unavailable" };
  }
  const rows = (candidates ?? []) as AgendaPayLinkBookingRow[];
  if (rows.length === 0) return { ok: false, reason: "not_found" };

  const candidateIds = rows.map((r) => r.id);
  const { data: legs, error: legErr } = await admin
    .from("booking_talent")
    .select("booking_id")
    .eq("talent_profile_id", input.talentId)
    .in("booking_id", candidateIds);
  if (legErr) {
    logServerError("agenda.createPayLink.leg", legErr);
    return { ok: false, reason: "unavailable" };
  }
  const legIds = new Set(
    ((legs ?? []) as Array<{ booking_id: string | null }>)
      .map((l) => l.booking_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const picked = pickAgendaCommercialBooking(rows, legIds);
  if (!picked) return { ok: false, reason: "not_found" };
  const row = rows.find((r) => r.id === picked.id);
  if (!row) return { ok: false, reason: "not_found" };
  return { ok: true, row };
}
