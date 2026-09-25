import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { zonedLocalToUtc } from "@/lib/scheduling/tz";

import { blocksTime, deriveBookingState, derivePaymentState } from "./derive";
import type { TalentAgendaItem, TalentAgendaLoadResult, TalentAgendaRange } from "./types";

type AgencyBookingRow = {
  id: string;
  status: string;
  payment_status: string;
  total_client_revenue: number;
  deposit_amount_cents: number | null;
  currency_code: string;
  timezone: string | null;
  client_timezone?: string | null;
  balance_due_at: string | null;
  source_type_snapshot: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  venue_name: string | null;
  venue_location_text: string | null;
  travel_before_min?: number | null;
  travel_after_min?: number | null;
  intake_status?: string | null;
  intake_sent_at?: string | null;
  order_id?: string | null;
  tenant_id?: string | null;
  payment_method?: string | null;
  payment_notes?: string | null;
};

type TalentBookingRow = {
  id: string;
  title: string;
  client_label: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  status: string;
  inquiry_id: string | null;
  tenant_id: string | null;
  location_text: string | null;
  travel_before_min?: number | null;
  travel_after_min?: number | null;
};

type TransactionRow = {
  booking_id: string;
  status: string;
  gross_amount_cents: number;
  requested_at: string | null;
  paid_at: string | null;
  refunded_at: string | null;
};

type PaymentLinkRow = {
  order_id: string | null;
  inquiry_id: string | null;
  status: string;
  expires_at: string;
};

type RescheduleRequestRow = {
  id: string;
  booking_id: string;
  new_starts_at: string;
  new_ends_at: string;
  fee_cents: number;
  status: string;
  created_at: string;
};

function initials(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "NA";
}

function mapSource(raw: string | null | undefined): TalentAgendaItem["source"] {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "agency") return "agency";
  if (value === "website" || value === "site" || value === "my_website") return "website";
  if (value === "tulala" || value === "profile") return "tulala";
  return "manual";
}

function latestTransaction(rows: readonly TransactionRow[]): TransactionRow | null {
  return (
    [...rows].sort((a, b) => {
      const aAt = a.paid_at ?? a.requested_at ?? a.refunded_at ?? "";
      const bAt = b.paid_at ?? b.requested_at ?? b.refunded_at ?? "";
      return bAt.localeCompare(aAt);
    })[0] ?? null
  );
}

function paidCentsFrom(
  agency: AgencyBookingRow | undefined,
  transactions: readonly TransactionRow[],
): number {
  const paid = transactions
    .filter((row) => row.status === "paid" || row.status === "payout_pending" || row.status === "payout_sent")
    .reduce((sum, row) => sum + row.gross_amount_cents, 0);
  if (paid > 0) return paid;
  if (agency?.payment_status === "paid") return agency.total_client_revenue;
  if (agency?.payment_status === "partial") return agency.deposit_amount_cents ?? 0;
  return 0;
}

function requestWindow(
  eventDate: string | null,
  timeZone: string,
): { startsAt: string; endsAt: string } | null {
  if (!eventDate) return null;
  const startsAt = zonedLocalToUtc(eventDate, 12 * 60, timeZone);
  if (!startsAt) return null;
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

/**
 * Server-only read model for Agenda V2.
 *
 * Layout note: `app/(workspace)/talent/layout.tsx` should call this only when
 * `isAgendaV2(talentProfileId)` is true, leaving the legacy calendar bridge
 * untouched while the flag is off.
 */
export async function loadTalentAgenda(
  talentProfileId: string,
  range: TalentAgendaRange,
): Promise<TalentAgendaLoadResult> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { items: [], hours: null };

    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();

    const [
      bookingsRes,
      holdsRes,
      blocksRes,
      hoursRes,
      profileRes,
    ] = await Promise.all([
      supabase
        .from("talent_bookings")
        .select(
          "id, title, client_label, starts_at, ends_at, all_day, status, inquiry_id, tenant_id, location_text, travel_before_min, travel_after_min",
        )
        .eq("talent_profile_id", talentProfileId)
        .gte("starts_at", fromIso)
        .lt("starts_at", toIso),
      supabase
        .from("talent_holds")
        .select("id, title, client_label, starts_at, ends_at, all_day, expires_at, inquiry_id, tenant_id")
        .eq("talent_profile_id", talentProfileId)
        .gte("starts_at", fromIso)
        .lt("starts_at", toIso),
      supabase
        .from("talent_availability_blocks")
        .select("id, reason, note, starts_at, ends_at, all_day")
        .eq("talent_profile_id", talentProfileId)
        .gte("starts_at", fromIso)
        .lt("starts_at", toIso),
      supabase
        .from("talent_booking_hours")
        .select("timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days")
        .eq("talent_profile_id", talentProfileId)
        .maybeSingle(),
      supabase
        .from("talent_profiles")
        .select("user_id")
        .eq("id", talentProfileId)
        .maybeSingle(),
    ]);

    if (bookingsRes.error) logServerError("talent-agenda.bookings", bookingsRes.error);
    if (holdsRes.error) logServerError("talent-agenda.holds", holdsRes.error);
    if (blocksRes.error) logServerError("talent-agenda.blocks", blocksRes.error);
    if (hoursRes.error) logServerError("talent-agenda.hours", hoursRes.error);
    if (profileRes.error) logServerError("talent-agenda.profile", profileRes.error);

    const bookings = (bookingsRes.data ?? []) as TalentBookingRow[];
    const hours = parseBookingHours(hoursRes.data);
    const bookingIds = bookings.map((row) => row.id);

    const fromYmd = fromIso.slice(0, 10);
    const toYmd = toIso.slice(0, 10);
    const ownerUserId =
      typeof profileRes.data?.user_id === "string" ? profileRes.data.user_id : null;

    const [agencyBookingsRes, transactionsRes, inquiriesRes, deliverablesRes, rescheduleRes] =
      await Promise.all([
      bookingIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("agency_bookings")
            .select(
              "id, status, payment_status, total_client_revenue, deposit_amount_cents, currency_code, timezone, client_timezone, balance_due_at, source_type_snapshot, contact_name, contact_email, contact_phone, venue_name, venue_location_text, travel_before_min, travel_after_min, intake_status, intake_sent_at, order_id, tenant_id, payment_method, payment_notes",
            )
            .in("id", bookingIds),
      bookingIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("booking_transactions")
            .select("booking_id, status, gross_amount_cents, requested_at, paid_at, refunded_at")
            .in("booking_id", bookingIds),
      ownerUserId == null
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("inquiries")
            .select("id, contact_name, contact_email, contact_phone, event_date, event_timezone, source_type, message, created_at, booked_at")
            .eq("owner_user_id", ownerUserId)
            .is("booked_at", null)
            .gte("event_date", fromYmd)
            .lte("event_date", toYmd),
      bookingIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("booking_deliverables")
            .select("id, booking_id, title, due_at, status")
            .in("booking_id", bookingIds)
            .not("due_at", "is", null)
            .gte("due_at", fromIso)
            .lt("due_at", toIso),
      bookingIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("booking_reschedule_requests")
            .select("id, booking_id, new_starts_at, new_ends_at, fee_cents, status, created_at")
            .in("booking_id", bookingIds)
            .eq("status", "pending"),
    ]);

    if (agencyBookingsRes.error) logServerError("talent-agenda.agency-bookings", agencyBookingsRes.error);
    if (transactionsRes.error) logServerError("talent-agenda.transactions", transactionsRes.error);
    if (inquiriesRes.error) logServerError("talent-agenda.inquiries", inquiriesRes.error);
    if (deliverablesRes.error) logServerError("talent-agenda.deliverables", deliverablesRes.error);
    if (rescheduleRes.error) logServerError("talent-agenda.reschedule", rescheduleRes.error);

    const agencyById = new Map(
      ((agencyBookingsRes.data ?? []) as AgencyBookingRow[]).map((row) => [row.id, row]),
    );
    const transactionsByBooking = new Map<string, TransactionRow[]>();
    for (const row of (transactionsRes.data ?? []) as TransactionRow[]) {
      const current = transactionsByBooking.get(row.booking_id) ?? [];
      current.push(row);
      transactionsByBooking.set(row.booking_id, current);
    }

    const pendingRescheduleByBooking = new Map<string, RescheduleRequestRow>();
    for (const row of (rescheduleRes.data ?? []) as RescheduleRequestRow[]) {
      if (!pendingRescheduleByBooking.has(row.booking_id)) {
        pendingRescheduleByBooking.set(row.booking_id, row);
      }
    }

    const holds = (holdsRes.data ?? []) as Array<{
      id: string;
      title: string;
      client_label: string | null;
      starts_at: string;
      ends_at: string;
      all_day: boolean;
      expires_at: string | null;
      inquiry_id: string | null;
      tenant_id: string | null;
    }>;

    const orderIds = [
      ...new Set(
        ((agencyBookingsRes.data ?? []) as AgencyBookingRow[])
          .map((r) => r.order_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const holdInquiryIds = [
      ...new Set(
        holds
          .map((h) => h.inquiry_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];

    const paymentLinkQueries: PromiseLike<{ data: unknown; error: unknown }>[] = [];
    if (orderIds.length > 0) {
      paymentLinkQueries.push(
        supabase
          .from("payment_links")
          .select("order_id, inquiry_id, status, expires_at")
          .in("order_id", orderIds)
          .eq("status", "open"),
      );
    }
    if (holdInquiryIds.length > 0) {
      paymentLinkQueries.push(
        supabase
          .from("payment_links")
          .select("order_id, inquiry_id, status, expires_at")
          .in("inquiry_id", holdInquiryIds)
          .eq("status", "open"),
      );
    }
    const paymentLinkResults =
      paymentLinkQueries.length === 0
        ? []
        : await Promise.all(paymentLinkQueries);
    for (const res of paymentLinkResults) {
      if (res.error) logServerError("talent-agenda.payment-links", res.error);
    }

    const openLinkByOrder = new Map<string, PaymentLinkRow>();
    const openLinkByInquiry = new Map<string, PaymentLinkRow>();
    for (const res of paymentLinkResults) {
      for (const row of (res.data ?? []) as PaymentLinkRow[]) {
        if (row.order_id) {
          const prev = openLinkByOrder.get(row.order_id);
          if (!prev || Date.parse(row.expires_at) > Date.parse(prev.expires_at)) {
            openLinkByOrder.set(row.order_id, row);
          }
        }
        if (row.inquiry_id) {
          const prev = openLinkByInquiry.get(row.inquiry_id);
          if (!prev || Date.parse(row.expires_at) > Date.parse(prev.expires_at)) {
            openLinkByInquiry.set(row.inquiry_id, row);
          }
        }
      }
    }

    const agencyTenantIds = [
      ...new Set(
        bookings
          .map((b) => b.tenant_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const agenciesRes =
      agencyTenantIds.length === 0
        ? { data: [], error: null }
        : await supabase.from("agencies").select("id, display_name").in("id", agencyTenantIds);
    if (agenciesRes.error) logServerError("talent-agenda.agencies", agenciesRes.error);
    const agencyNameById = new Map(
      ((agenciesRes.data ?? []) as Array<{ id: string; display_name: string | null }>).map((row) => [
        row.id,
        (row.display_name ?? "").trim() || "Agency",
      ]),
    );

    const items: TalentAgendaItem[] = [];

    for (const booking of bookings) {
      const agency = agencyById.get(booking.id);
      const txRows = transactionsByBooking.get(booking.id) ?? [];
      const latest = latestTransaction(txRows);
      const paidCents = paidCentsFrom(agency, txRows);
      const openLink =
        agency?.order_id != null ? openLinkByOrder.get(agency.order_id) : undefined;
      const linkOpen =
        openLink != null && Date.parse(openLink.expires_at) > range.from.getTime();
      const bookingState = deriveBookingState({
        kind: "booking",
        status: agency?.status ?? booking.status,
        now: range.from,
      });
      const paymentState = derivePaymentState({
        booking: bookingState,
        paymentStatus: agency?.payment_status,
        transactionStatus: latest?.status,
        checking: linkOpen && (latest?.status === "pending" || latest?.status === "processing"),
        paymentMethod: agency?.payment_method ?? null,
        transferAwaiting: (agency?.payment_method ?? "").toLowerCase() === "transfer",
        startsAt: booking.starts_at,
        balanceDueAt: agency?.balance_due_at ?? null,
        totalCents: agency?.total_client_revenue ?? 0,
        paidCents,
        depositCents: agency?.deposit_amount_cents ?? 0,
        managedByAgency: mapSource(agency?.source_type_snapshot) === "agency",
        now: range.from,
      });
      // Open unpaid link with no txn yet → awaiting deposit/payment.
      const payment =
        paymentState === "none" && linkOpen && (agency?.payment_status ?? "unpaid") === "unpaid"
          ? "awaiting"
          : paymentState;

      const travelBefore = Math.max(
        0,
        agency?.travel_before_min ?? booking.travel_before_min ?? 0,
      );
      const travelAfter = Math.max(
        0,
        agency?.travel_after_min ?? booking.travel_after_min ?? 0,
      );
      // occupiedInterval uses one travelMin on both sides; take the larger pad.
      const travelMin = Math.max(travelBefore, travelAfter);

      const history: TalentAgendaItem["history"] = [];
      const pendingReschedule = pendingRescheduleByBooking.get(booking.id);
      if (pendingReschedule) {
        history.push({
          at: pendingReschedule.created_at,
          text: "Reschedule pending.",
        });
      }

      const intakeStatus = agency?.intake_status ?? null;
      let tradeSection: TalentAgendaItem["tradeSection"];
      if (intakeStatus === "pending" || intakeStatus === "complete" || intakeStatus === "waived") {
        tradeSection = {
          kind: "intake",
          payload: {
            status: intakeStatus,
            sentAt: agency?.intake_sent_at ?? null,
            ...(pendingReschedule
              ? {
                  rescheduleRequestId: pendingReschedule.id,
                  rescheduleStatus: "pending",
                  newStartsAt: pendingReschedule.new_starts_at,
                  newEndsAt: pendingReschedule.new_ends_at,
                  feeCents: pendingReschedule.fee_cents,
                }
              : {}),
          },
        };
      } else if (pendingReschedule) {
        tradeSection = {
          kind: "event",
          payload: {
            rescheduleRequestId: pendingReschedule.id,
            rescheduleStatus: "pending",
            newStartsAt: pendingReschedule.new_starts_at,
            newEndsAt: pendingReschedule.new_ends_at,
            feeCents: pendingReschedule.fee_cents,
          },
        };
      }

      const item: TalentAgendaItem = {
        id: booking.id,
        kind: "booking",
        ref: { table: "agency_bookings", id: booking.id },
        client: {
          name: agency?.contact_name ?? booking.client_label ?? "Untitled client",
          initials: initials(agency?.contact_name ?? booking.client_label),
          email: agency?.contact_email ?? undefined,
          phone: agency?.contact_phone ?? undefined,
        },
        title: booking.title,
        lines: [{ label: booking.title, cents: agency?.total_client_revenue ?? 0 }],
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        allDay: booking.all_day,
        tz: agency?.timezone ?? hours?.timezone ?? "UTC",
        clientTz: agency?.client_timezone ?? undefined,
        where: {
          mode: agency?.venue_name || agency?.venue_location_text || booking.location_text ? "away" : "studio",
          label:
            agency?.venue_name ??
            agency?.venue_location_text ??
            booking.location_text ??
            "Booking",
          travelMin: travelMin > 0 ? travelMin : undefined,
        },
        bufferAfterMin: hours?.bufferAfterMin ?? 0,
        booking: bookingState,
        payment,
        money: {
          totalCents: agency?.total_client_revenue ?? 0,
          paidCents,
          depositCents: agency?.deposit_amount_cents ?? undefined,
          dueCents: Math.max(0, (agency?.total_client_revenue ?? 0) - paidCents),
          currency: agency?.currency_code ?? "MXN",
        },
        source: mapSource(agency?.source_type_snapshot),
        managedBy:
          mapSource(agency?.source_type_snapshot) === "agency" && booking.tenant_id
            ? {
                agencyId: booking.tenant_id,
                name: agencyNameById.get(booking.tenant_id) ?? "Agency",
              }
            : undefined,
        orderId: agency?.order_id ?? undefined,
        blocksTime: false,
        tradeSection,
        history,
      };
      item.blocksTime = blocksTime(item);
      items.push(item);
    }

    for (const hold of holds) {
      const openLink =
        hold.inquiry_id != null ? openLinkByInquiry.get(hold.inquiry_id) : undefined;
      const linkOpen =
        openLink != null && Date.parse(openLink.expires_at) > range.from.getTime();
      const bookingState = deriveBookingState({
        kind: "hold",
        holdUntil: hold.expires_at,
        now: range.from,
      });
      let payment = derivePaymentState({
        booking: bookingState,
        paidCents: 0,
        depositCents: 1,
        totalCents: 1,
        now: range.from,
      });
      if (linkOpen && payment === "awaiting") {
        // Keep awaiting; open link reinforces hold deposit wait.
      } else if (linkOpen && payment === "none") {
        payment = "awaiting";
      }
      const item: TalentAgendaItem = {
        id: hold.id,
        kind: "hold",
        ref: { table: "talent_holds", id: hold.id },
        client: hold.client_label
          ? { name: hold.client_label, initials: initials(hold.client_label) }
          : undefined,
        title: hold.title,
        lines: [],
        startsAt: hold.starts_at,
        endsAt: hold.ends_at,
        allDay: hold.all_day,
        tz: hours?.timezone ?? "UTC",
        where: { mode: "studio", label: "Hold" },
        bufferAfterMin: hours?.bufferAfterMin ?? 0,
        booking: bookingState,
        payment,
        money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "MXN" },
        source: "website",
        holdUntil: hold.expires_at ?? undefined,
        blocksTime: true,
        history: linkOpen
          ? [{ at: openLink!.expires_at, text: "Payment link open." }]
          : [],
      };
      item.blocksTime = blocksTime(item);
      items.push(item);
    }

    for (const block of (blocksRes.data ?? []) as Array<{
      id: string;
      reason: string;
      note: string | null;
      starts_at: string;
      ends_at: string;
      all_day: boolean;
    }>) {
      const item: TalentAgendaItem = {
        id: block.id,
        kind: "block",
        ref: { table: "talent_availability_blocks", id: block.id },
        title: block.reason,
        lines: [],
        startsAt: block.starts_at,
        endsAt: block.ends_at,
        allDay: block.all_day,
        tz: hours?.timezone ?? "UTC",
        where: { mode: "away", label: block.note ?? block.reason },
        bufferAfterMin: 0,
        booking: "confirmed",
        payment: "none",
        money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "MXN" },
        source: "manual",
        blocksTime: true,
        history: [],
      };
      items.push(item);
    }

    for (const inquiry of (inquiriesRes.data ?? []) as Array<{
      id: string;
      contact_name: string;
      contact_email: string;
      contact_phone: string | null;
      event_date: string | null;
      event_timezone: string | null;
      source_type: string;
      message: string | null;
      created_at: string;
      booked_at: string | null;
    }>) {
      const timeZone = inquiry.event_timezone ?? hours?.timezone ?? "UTC";
      const window = requestWindow(inquiry.event_date, timeZone);
      if (!window) continue;

      const item: TalentAgendaItem = {
        id: inquiry.id,
        kind: "request",
        ref: { table: "inquiries", id: inquiry.id },
        client: {
          name: inquiry.contact_name,
          initials: initials(inquiry.contact_name),
          email: inquiry.contact_email,
          phone: inquiry.contact_phone ?? undefined,
        },
        title: inquiry.message?.trim() || "Booking request",
        lines: [],
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        allDay: true,
        tz: timeZone,
        where: { mode: "online", label: "Open request" },
        bufferAfterMin: 0,
        booking: "requested",
        payment: "none",
        money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "MXN" },
        source: mapSource(inquiry.source_type),
        blocksTime: false,
        history: inquiry.created_at ? [{ at: inquiry.created_at, text: "Request opened." }] : [],
      };
      items.push(item);
    }

    for (const deliverable of (deliverablesRes.data ?? []) as Array<{
      id: string;
      booking_id: string;
      title: string;
      due_at: string;
      status: string | null;
    }>) {
      if (!deliverable.due_at) continue;
      const due = new Date(deliverable.due_at);
      if (Number.isNaN(due.getTime())) continue;
      const dayStart = new Date(due);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(due);
      dayEnd.setHours(23, 59, 59, 999);
      items.push({
        id: `deadline-${deliverable.id}`,
        kind: "deadline",
        ref: { table: "booking_deliverables", id: deliverable.id },
        title: deliverable.title || "Delivery",
        lines: [],
        startsAt: dayStart.toISOString(),
        endsAt: dayEnd.toISOString(),
        allDay: true,
        tz: hours?.timezone ?? "UTC",
        where: { mode: "online", label: "Deadline" },
        bufferAfterMin: 0,
        booking: deliverable.status === "delivered" ? "completed" : "confirmed",
        payment: "none",
        money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "MXN" },
        source: "manual",
        blocksTime: false,
        tradeSection: { kind: "estimate", payload: { bookingId: deliverable.booking_id } },
        history: [],
      });
    }

    items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { items, hours };
  } catch (error) {
    logServerError("talent-agenda.load", error);
    return { items: [], hours: null };
  }
}
